import test from "node:test";
import assert from "node:assert/strict";
import { publisherFailureRecord, runPublisherJob } from "../jobs/publisher.mjs";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";

test("missing configuration fails with sanitized output", () => {
  assert.throws(
    () => createOpenAIGenerator({ apiKey: "" }),
    (error) => {
      const output = JSON.stringify(publisherFailureRecord(error));
      assert.match(output, /"event":"publisher_failed"/);
      assert.doesNotMatch(output, /OPENAI_API_KEY|sk-/);
      return true;
    }
  );

  assert.throws(
    () => createOpenAIGenerator({ apiKey: "test-key-not-secret", prompts: {} }),
    (error) => {
      const output = JSON.stringify(publisherFailureRecord(error));
      assert.match(output, /"event":"publisher_failed"/);
      assert.doesNotMatch(output, /QUIET_NEWS_.*PROMPT|Test discovery|Test sift/);
      return true;
    }
  );
});

test("already published jobs skip private archive preparation and prompt loading", async () => {
  const result = await runPublisherJob({
    env: {}, logger: { info() {} },
    store: { hasEdition: async () => true },
    prepareGeneration: async () => { throw new Error("must not prepare"); },
    onGenerationStage: async () => { throw new Error("must not archive"); }
  });
  assert.equal(result.status, "already_published");
});

test("archive preflight failure stops before generator configuration or publication", async () => {
  await assert.rejects(() => runPublisherJob({
    env: {}, logger: { info() {} },
    store: {
      hasEdition: async () => false, readEdition: async () => null,
      publish: async () => { assert.fail("must not publish"); }
    },
    prepareGeneration: async () => { throw new Error("preflight unavailable"); }
  }), /preflight unavailable/);
});

test("failure diagnostics discard untrusted fields and malformed identifiers", () => {
  const record = publisherFailureRecord({
    name: "secret error name", errorCode: "secret provider code",
    message: "secret provider message",
    metadata: {
      stage: "secret stage", targetDate: "secret input", attempts: -1,
      maxAttempts: Infinity, totalProviderAttempts: 999, httpStatus: "secret status",
      requestId: "req_test\nsecret header", timeoutSource: "secret reason",
      timeoutMs: "secret timeout", attemptDurationMs: -1, durationMs: Infinity,
      body: "secret response body", prompt: "secret prompt", key: "secret key"
    }
  });
  assert.equal(record.code, "Error");
  for (const [key, value] of Object.entries(record)) {
    if (!["event", "code"].includes(key)) assert.equal(value, null, key);
  }
  assert.doesNotMatch(JSON.stringify(record), /secret/);
});

test("a storage failure cannot emit the generation-only no-publication summary", async (t) => {
  const logs = [];
  let requests = 0;
  let stored = false;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests += 1;
    const body = JSON.parse(options.body);
    const output = requests === 1
      ? { target_date: JSON.parse(body.input[1].content).target_day, candidates: [] }
      : { stories: [], rejections: [] };
    return {
      ok: true, status: 200, headers: { get: () => "req_test" },
      json: async () => ({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }]
      })
    };
  });
  await assert.rejects(runPublisherJob({
    env: {
      OPENAI_API_KEY: "test-key-not-secret",
      QUIET_NEWS_DISCOVERY_PROMPT: "Test discovery system prompt.",
      QUIET_NEWS_DISCOVERY_PROMPT_VERSION: "test-discovery-v1",
      QUIET_NEWS_SIFT_PROMPT: "Test sift system prompt.",
      QUIET_NEWS_SIFT_PROMPT_VERSION: "test-sift-v1"
    },
    logger: { info: (line) => logs.push(line), error: (line) => logs.push(line) },
    store: {
      hasEdition: async () => false, readEdition: async () => null,
      publish: async () => { stored = true; throw new Error("storage failure after write"); }
    }
  }), /storage failure after write/);
  assert.equal(requests, 2);
  assert.equal(stored, true);
  assert.doesNotMatch(logs.join("\n"), /generation_failed|No new publication was saved/);
});
