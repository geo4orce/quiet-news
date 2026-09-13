import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { CollectionStore, collectionWindow, collectionReadiness, completedPool, localBoundary, mergeCollection } from "../lib/collection.mjs";
import { runCheckpointedJob } from "../jobs/checkpointed.mjs";

const day = "2026-09-12";
const candidate = (id, title = id) => ({ candidate_id: id, title, summary: "A sourced fact.", event_date: day,
  category: "science", geography: "global", sources: [{ name: "Source", url: `https://example.com/${id}` }] });
const output = (candidates = [], withdrawals = []) => ({ target_date: day, candidates, withdrawals });
const quiet = { info() {}, warn() {}, error() {} };
const prompts = { collection: "mock collection", collectionVersion: "mock-1", sift: "mock sift", siftVersion: "mock-1" };
const request = (id) => ({ status: "completed", responseId: `resp_${id}`, attempts: 1, startedAt: "2026-09-12T10:07:00Z" });

test("four collection slots cover the New York day including DST midnight boundaries", () => {
  assert.deepEqual(collectionWindow(new Date("2026-09-13T07:07:00Z")), { targetDate: day, slot: 24 });
  for (const [utc, slot] of [[10, 6], [16, 12], [22, 18]]) {
    assert.deepEqual(collectionWindow(new Date(`2026-09-12T${utc}:07:00Z`)), { targetDate: day, slot });
  }
  assert.equal(localBoundary("2026-03-08", 0), "2026-03-08T05:00:00.000Z");
  assert.equal(localBoundary("2026-03-08", 24), "2026-03-09T04:00:00.000Z");
  assert.equal(localBoundary("2026-11-01", 0), "2026-11-01T04:00:00.000Z");
  assert.equal(localBoundary("2026-11-01", 24), "2026-11-02T05:00:00.000Z");
});

test("batch updates preserve unchanged facts and validate duplicate withdrawals", () => {
  const initial = [candidate("one"), candidate("two")];
  const merged = mergeCollection(initial, output([candidate("one", "Corrected fact"), candidate("three")], [
    { candidate_id: "two", code: "duplicate_event", replacement_id: "one" }
  ]), day);
  assert.deepEqual(merged.map((item) => item.candidate_id), ["one", "three"]);
  assert.equal(merged[0].title, "Corrected fact");
  assert.equal(initial[0].title, "one");
  assert.throws(() => mergeCollection(initial, output([], [
    { candidate_id: "two", code: "duplicate_event", replacement_id: "missing" }
  ]), day));
  assert.throws(() => mergeCollection(initial, { ...output(), private_reasoning: "unsafe" }, day));
});

test("four validated batches can retain eighty candidates without first-arrival truncation", () => {
  let pool = [];
  for (let batch = 0; batch < 4; batch++) {
    pool = mergeCollection(pool, output(Array.from({ length: 20 }, (_, index) => candidate(`c-${batch}-${index}`))), day);
  }
  assert.equal(pool.length, 80);
  assert.throws(() => mergeCollection(pool, output([candidate("overflow")]), day));
});

test("four durable collections feed one sift and duplicate publish invocations cost nothing", async (t) => {
  const checkout = await mkdtemp(path.join(tmpdir(), "quiet-collection-test-"));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  let instant;
  const calls = [], commits = [];
  const persist = async (paths) => commits.push([...paths]);
  const execute = async (options) => {
    calls.push(options.stage);
    await options.saveRequest({ ...request(calls.length), status: "in_progress" });
    const input = JSON.parse(options.body.input[1].content);
    const value = options.stage === "discovery" ? output([candidate(`item-${calls.length}`)]) : {
      stories: [], rejections: input.candidate_set.candidates.map((item) => ({ candidate_id: item.candidate_id, code: "insufficient_materiality" }))
    };
    options.validate(value);
    return { output: value, metadata: { responseId: `resp_${calls.length}`, stage: options.stage, inputTokens: 10, outputTokens: 5, webSearchCalls: 0 }, request: request(calls.length) };
  };
  const options = { checkout, apiKey: "mock", loadPrompts: async () => prompts, persist, logger: quiet, execute, now: () => new Date(instant) };
  for (const time of ["2026-09-12T10:07:00Z", "2026-09-12T16:07:00Z", "2026-09-12T22:07:00Z", "2026-09-13T07:07:00Z"]) {
    instant = time;
    assert.equal((await runCheckpointedJob({ ...options, mode: "collect" })).status, "collected");
    assert.equal((await runCheckpointedJob({ ...options, mode: "collect" })).status, "already_collected");
  }
  instant = "2026-09-13T08:07:00Z";
  assert.equal((await runCheckpointedJob({ ...options, mode: "publish" })).status, "published");
  assert.equal((await runCheckpointedJob({ ...options, mode: "publish", loadPrompts: () => { throw new Error("Must not load"); } })).status, "already_published");
  assert.deepEqual(calls, ["discovery", "discovery", "discovery", "discovery", "sift"]);
  assert.equal(commits.filter((paths) => paths.some((file) => file.startsWith("public/"))).length, 1);
  const archive = await new CollectionStore(checkout).read(day);
  assert.equal(completedPool(archive).coveredThrough, 24);
  assert.equal(archive.collection.sift.result.output.rejections.length, 4);
  for (let number = 1; number <= 4; number++) {
    const snapshot = JSON.parse(await readFile(path.join(checkout, "data-raw", `${day}.discovery-${number}.json`), "utf8"));
    assert.equal(snapshot.batch, number);
    assert.equal(snapshot.target_date, day);
    assert.equal(new Date(snapshot.captured_at).toISOString(), snapshot.captured_at);
    assert.deepEqual(snapshot.output, archive.collection.batches[number - 1].result.output);
  }
  archive.collection.batches[0].result.output.candidates[0].title = "A changed saved result";
  await assert.rejects(new CollectionStore(checkout).save(archive), /Completed discovery snapshot differs/);
});

test("a failed publication push reuses the completed sift after a fresh checkout", async () => {
  const archive = { schema_version: 1, target_date: day, runs: [], collection: { version: 1, batches: [
    { slot: 24, fromHour: 0, result: { output: output([candidate("one")]) }, request: request(1) }
  ], sift: null } };
  let persisted = structuredClone(archive), siftCalls = 0, failPush = true, published = 0;
  const research = { read: async () => structuredClone(persisted), save: async (value) => { persisted = structuredClone(value); } };
  const options = { checkout: "unused", research, now: () => new Date("2026-09-13T08:07:00Z"), mode: "publish", logger: quiet,
    apiKey: "mock", loadPrompts: async () => prompts,
    publications: { hasEdition: async () => false, readEdition: async () => null, publish: async () => { published++; } },
    persist: async () => { if (failPush) throw new Error("Git push failed"); },
    execute: async (options) => { siftCalls++; const value = { stories: [], rejections: [{ candidate_id: "one", code: "insufficient_materiality" }] };
      options.validate(value); return { output: value, metadata: {}, request: request(2) }; } };
  await assert.rejects(runCheckpointedJob(options), /Git push failed/);
  failPush = false;
  assert.equal((await runCheckpointedJob(options)).status, "published");
  assert.equal(siftCalls, 1);
  assert.equal(published, 2);
});

test("insufficient saved research blocks publication before loading prompts", async () => {
  await assert.rejects(runCheckpointedJob({ mode: "publish", checkout: "unused", now: () => new Date("2026-09-13T08:07:00Z"),
    logger: quiet, publications: { hasEdition: async () => false, readEdition: async () => null },
    research: { read: async () => ({ target_date: day, collection: { batches: [] } }) },
    loadPrompts: () => { throw new Error("Must not load prompts"); } }), { errorCode: "collection_incomplete" });
});

test("any one failed collection still leaves the other three usable for the morning sift", async () => {
  for (const failedSlot of [6, 12, 18, 24]) {
    let coveredThrough = 0;
    const batches = [6, 12, 18, 24].map((slot) => {
      if (slot === failedSlot) return { slot, fromHour: coveredThrough, request: { status: "failed" }, result: null };
      const batch = { slot, fromHour: coveredThrough, request: request(slot), result: { output: output([candidate(`item-${slot}`)]) } };
      coveredThrough = slot;
      return batch;
    });
    const archive = { target_date: day, collection: { batches, sift: null } };
    const warnings = [];
    let saved, siftInputValue, published;
    const result = await runCheckpointedJob({ mode: "publish", checkout: "unused", apiKey: "mock",
      now: () => new Date("2026-09-13T08:07:00Z"), loadPrompts: async () => prompts,
      logger: { info() {}, warn: (line) => warnings.push(line) },
      research: { read: async () => archive, save: async (value) => { saved = structuredClone(value); } },
      publications: { hasEdition: async () => false, readEdition: async () => null, publish: async (value) => { published = value; } },
      persist: async () => {},
      execute: async (options) => {
        assert.equal(options.stage, "sift");
        siftInputValue = JSON.parse(options.body.input[1].content);
        const pool = siftInputValue.candidate_set.candidates;
        const value = { stories: [{ candidate_id: pool[0].candidate_id, headline: "A confirmed development", body: "A confirmed sourced fact.", sources: pool[0].sources }],
          rejections: pool.slice(1).map((item) => ({ candidate_id: item.candidate_id, code: "insufficient_materiality" })) };
        options.validate(value);
        return { output: value, metadata: {}, request: request("sift") };
      }
    });
    assert.equal(result.status, "published");
    assert.equal(result.coverage.successfulBatches, 3);
    assert.equal(published.stories.length, 1);
    assert.equal(siftInputValue.candidate_set.candidates.length, 3);
    assert.deepEqual(saved.collection.sift.coverage, result.coverage);
    assert.equal(result.coverage.status, failedSlot === 24 ? "partial" : "complete");
    assert.equal(warnings.length, failedSlot === 24 ? 1 : 0);
  }
});

test("two incomplete batches are insufficient, while a completed catch-up pass remains valid", () => {
  const archive = { target_date: day, collection: { batches: [
    { slot: 6, fromHour: 0, result: { output: output() }, request: request(1) },
    { slot: 12, fromHour: 6, result: { output: output() }, request: request(2) }
  ] } };
  assert.equal(collectionReadiness(archive).canPublish, false);
  archive.collection.batches.push({ slot: 24, fromHour: 12, result: { output: output() }, request: request(3) });
  assert.equal(collectionReadiness(archive).canPublish, true);
  assert.equal(collectionReadiness(archive).coverage.status, "complete");
});

test("a later collection covers a missed interval instead of pretending the failed run was quiet", async () => {
  const archive = { target_date: day, collection: { batches: [
    { slot: 6, fromHour: 0, request: { status: "unknown" }, result: null }
  ] } };
  let captured;
  const result = await runCheckpointedJob({ mode: "collect", checkout: "unused", apiKey: "mock", logger: quiet,
    now: () => new Date("2026-09-12T16:07:00Z"), loadPrompts: async () => prompts,
    publications: { hasEdition: async () => false, readEdition: async () => null },
    research: { read: async () => archive, save: async () => {} },
    execute: async (options) => {
      captured = JSON.parse(options.body.input[1].content);
      options.validate(output());
      return { output: output(), metadata: {}, request: request(2) };
    } });
  assert.equal(captured.window_start, "2026-09-12T04:00:00.000Z");
  assert.equal(captured.window_end, "2026-09-12T16:00:00.000Z");
  assert.equal(result.status, "collected");
  assert.equal(completedPool(archive).coveredThrough, 12);
});
