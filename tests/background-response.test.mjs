import test from "node:test";
import assert from "node:assert/strict";
import { backgroundResponse, requestFingerprint } from "../lib/background-response.mjs";

const body = { model: "mock-model", reasoning: { effort: "medium" }, input: [] };
const response = (status, output = { ok: true }) => ({ id: "resp_test", status,
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
  usage: { input_tokens: 10, output_tokens: 3 } });
const http = (value, status = 200) => ({ ok: status < 300, status, headers: new Headers(), json: async () => value });
const quiet = { info() {} };
const validate = (output) => assert.equal(output.ok, true);

test("a slow response is polled through the soft deadline with exactly one generation POST", async () => {
  let now = Date.parse("2026-09-12T10:07:00Z");
  const saved = [], calls = [], logs = [];
  const result = await backgroundResponse({ apiKey: "mock-key", body, stage: "discovery", targetDate: "2026-09-12",
    saveRequest: async (state) => saved.push(state), validate, nowMs: () => now,
    sleep: async (ms) => { now += ms; }, softTimeoutMs: 5, hardTimeoutMs: 50, pollMs: 3,
    logger: { info: (line) => logs.push(JSON.parse(line)) },
    fetchImpl: async (url, options) => {
      calls.push(options.method);
      if (options.method === "POST") {
        assert.equal(saved[0].status, "submitting");
        assert.ok(saved[0].claimId);
        const payload = JSON.parse(options.body);
        assert.equal(payload.background, true);
        assert.equal(payload.store, false);
      }
      return http(response(calls.length < 4 ? "in_progress" : "completed"));
    }
  });
  assert.deepEqual(calls, ["POST", "GET", "GET", "GET"]);
  assert.equal(logs.filter((record) => record.event === "generation_slow").length, 1);
  assert.equal(result.request.status, "completed");
  assert.ok(saved.every((record) => !Object.hasOwn(record, "output") && !Object.hasOwn(record, "input")));
});

test("restart and failed polls retrieve the existing response instead of creating another", async () => {
  let now = 1_000;
  const request = { fingerprint: requestFingerprint({ ...body, background: true, store: false }),
    status: "in_progress", attempts: 1, responseId: "resp_test", startedAt: new Date(now).toISOString() };
  const calls = [];
  const result = await backgroundResponse({ apiKey: "mock", body, stage: "discovery", request,
    saveRequest: async () => {}, validate, logger: quiet, nowMs: () => now, sleep: async (ms) => { now += ms; },
    pollMs: 1, fetchImpl: async (url, options) => {
      calls.push(options.method);
      if (calls.length === 1) throw new Error("network interrupted");
      return http(response("completed"));
    } });
  assert.deepEqual(calls, ["GET", "GET"]);
  assert.equal(result.output.ok, true);
});

test("an uncertain submission remains claimed and cannot cause another paid POST", async () => {
  let saved;
  let calls = 0;
  const options = { apiKey: "mock", body, stage: "discovery", saveRequest: async (state) => { saved = state; },
    validate, logger: quiet, fetchImpl: async () => { calls++; throw new Error("disconnected after submission"); } };
  await assert.rejects(backgroundResponse(options), { errorCode: "submission_outcome_unknown" });
  assert.equal(saved.status, "unknown");
  await assert.rejects(backgroundResponse({ ...options, request: saved }), { errorCode: "submission_outcome_unknown" });
  assert.equal(calls, 1);
});

test("a failed durable claim prevents any provider call", async () => {
  let calls = 0;
  await assert.rejects(backgroundResponse({ apiKey: "mock", body, stage: "discovery", validate,
    logger: quiet, saveRequest: async () => { throw new Error("push rejected"); },
    fetchImpl: async () => { calls++; } }), { errorCode: "checkpoint_write_failed" });
  assert.equal(calls, 0);
});

test("discovery warns at five minutes and cancels at ten without restarting the request", async () => {
  let now = 1000;
  const calls = [], saved = [], logs = [];
  await assert.rejects(backgroundResponse({ apiKey: "mock", body, stage: "discovery", validate,
    logger: { info: (line) => logs.push(JSON.parse(line)) },
    saveRequest: async (state) => saved.push(state), nowMs: () => now, sleep: async (ms) => { now += ms; },
    fetchImpl: async (url, options) => { calls.push([url, options.method]); return http(response(url.endsWith("/cancel") ? "cancelled" : "in_progress")); }
  }), { errorCode: "overall_deadline" });
  assert.equal(now - 1000, 600_000);
  const warnings = logs.filter((record) => record.event === "generation_slow");
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].elapsedMs, 300_000);
  assert.equal(warnings[0].continuingSameRequest, true);
  assert.equal(calls.filter(([url, method]) => method === "POST" && !url.endsWith("/cancel")).length, 1);
  assert.equal(calls.at(-1)[0].endsWith("/cancel"), true);
  assert.equal(saved.at(-1).status, "cancelled");
});

test("expired responses and changed request inputs fail without a new submission", async () => {
  const request = { fingerprint: requestFingerprint({ ...body, background: true, store: false }),
    status: "in_progress", attempts: 1, responseId: "resp_test", startedAt: new Date().toISOString() };
  let calls = 0;
  const options = { apiKey: "mock", body, stage: "discovery", request, validate, logger: quiet,
    saveRequest: async () => {}, fetchImpl: async () => { calls++; return http({}, 404); } };
  await assert.rejects(backgroundResponse(options), { errorCode: "response_expired" });
  await assert.rejects(backgroundResponse({ ...options, body: { ...body, input: ["changed"] } }), { errorCode: "checkpoint_mismatch" });
  assert.equal(calls, 1);
});

test("a response completing during cancellation is retained", async () => {
  let now = 1000;
  const result = await backgroundResponse({ apiKey: "mock", body, stage: "discovery", validate, logger: quiet,
    saveRequest: async () => {}, nowMs: () => now, sleep: async (ms) => { now += ms; },
    pollMs: 2, softTimeoutMs: 1, hardTimeoutMs: 3,
    fetchImpl: async (url) => http(response(url.endsWith("/cancel") ? "completed" : "in_progress")) });
  assert.equal(result.request.status, "completed");
});
