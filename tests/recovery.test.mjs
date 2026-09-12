import test from "node:test";
import assert from "node:assert/strict";
import { recoveryWindow, recoverDay } from "../scripts/recover-day.mjs";
import { createPublication } from "../lib/publication.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("backfills retain real publication time while older days immediately expire", () => {
  const now = new Date("2026-09-12T03:00:00.000Z");
  const old = createPublication(recoveryWindow("2026-09-08", now), { stories: [] });
  assert.equal(old.published_at, now.toISOString());
  assert.ok(new Date(old.expires_at) < new Date(now.getTime() + 1000));
  const latest = recoveryWindow("2026-09-10", now);
  assert.equal(latest.expiresAt, "2026-09-12T09:00:00.000Z");
  assert.throws(() => recoveryWindow("2026-09-11", now));
  assert.throws(() => recoveryWindow("invalid", now));
});

test("failed sift retains discovery and recovery publishes without repeating successful calls", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "quiet-recovery-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new PublicationStore(path.join(root, "public/data"));
  await store.publish(createPublication({ editionDay: "2000-01-01",
    publishedAt: "2000-01-02T08:00:00.000Z", expiresAt: "2000-01-03T10:00:00.000Z" }, { stories: [] }));
  const prompts = { discovery: "Test discovery prompt.", discoveryVersion: "test-discovery-v1",
    sift: "Test sift prompt.", siftVersion: "test-sift-v1" };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls += 1;
    const body = JSON.parse(options.body);
    if (calls > 1) assert.equal(body.text.format.name, "quiet_news_sift");
    return { ok: calls !== 2, status: calls === 2 ? 400 : 200,
      headers: { get: () => "req_test" }, json: async () => calls === 2 ? { error: {} } : {
        id: `resp_${calls}`, status: "completed", output: [{ type: "message", content: [{ type: "output_text",
          text: JSON.stringify(calls === 1 ? { target_date: "2000-01-02", candidates: [] } : { stories: [], rejections: [] }) }] }]
      } };
  });
  const options = { root, date: "2000-01-02", apiKey: "test-key-not-secret", logger: { info() {}, warn() {}, error() {} },
    privateRunner: { loadPrompts: async () => prompts, assertPrivateStoryLimit: (value) => value } };
  await assert.rejects(recoverDay({ ...options, mode: "generate" }));
  assert.equal(await store.hasEdition(options.date), false);
  const raw = JSON.parse(await readFile(path.join(root, "data-raw/2000-01-02.json"), "utf8"));
  assert.equal(raw.runs.length, 1);
  assert.equal(raw.runs[0].sift, null);
  assert.equal((await recoverDay({ ...options, mode: "generate" })).status, "ready_for_review");
  assert.equal(calls, 3);
  assert.equal((await recoverDay({ ...options, mode: "publish" })).status, "saved_locally");
  assert.equal((await recoverDay({ ...options, mode: "generate" })).status, "already_published");
  assert.equal(calls, 3);
});
