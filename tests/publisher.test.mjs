import test from "node:test";
import assert from "node:assert/strict";
import { GenerationError } from "../lib/openai-generator.mjs";
import { publishDailyEdition } from "../lib/publisher.mjs";

function quietLogger() {
  return { info() {}, warn() {} };
}

function fakeStore(overrides = {}) {
  return {
    hasEdition: async () => false,
    readCurrent: async () => null,
    publish: async () => {},
    ...overrides
  };
}

function publish(options = {}) {
  return publishDailyEdition({
    store: fakeStore(),
    generate: async () => ({ edition: { stories: [] }, metadata: { responseId: "resp_test" } }),
    now: () => new Date("2026-08-16T08:07:00.000Z"),
    retryDelaysMs: [10, 20],
    sleep: async () => {},
    logger: quietLogger(),
    ...options
  });
}

test("publishes the completed previous New York day", async () => {
  let written;
  let input;
  const result = await publish({
    store: fakeStore({
      publish: async (value) => { written = value; }
    }),
    generate: async (value) => {
      input = value;
      return { edition: { stories: [] }, metadata: {} };
    }
  });
  assert.equal(result.status, "published");
  assert.equal(result.editionDate, "2026-08-15");
  assert.equal(written.edition_date, "2026-08-15");
  assert.equal(written.expires_at, "2026-08-17T09:00:00.000Z");
  assert.deepEqual(input, { editionDay: "2026-08-15", priorEdition: { stories: [] } });
});

test("an existing dated archive is a successful no-op before generation", async () => {
  let generated = false;
  const result = await publish({
    store: fakeStore({ hasEdition: async () => true }),
    generate: async () => { generated = true; }
  });
  assert.deepEqual(result, { status: "already_published", editionDate: "2026-08-15" });
  assert.equal(generated, false);
});

test("passes the current edition as prior editorial context", async () => {
  const prior = { stories: [{ headline: "Prior", body: "Prior body", sources: [] }] };
  let input;
  await publish({
    store: fakeStore({ readCurrent: async () => ({ ...prior, edition_date: "x" }) }),
    generate: async (value) => {
      input = value;
      return { edition: { stories: [] }, metadata: {} };
    }
  });
  assert.deepEqual(input.priorEdition, prior);
});

test("retries transient generation failures no more than three total calls", async () => {
  const delays = [];
  let calls = 0;
  const result = await publish({
    generate: async () => {
      calls += 1;
      if (calls < 3) throw new GenerationError("rate_limit", true);
      return { edition: { stories: [] }, metadata: {} };
    },
    sleep: async (delay) => delays.push(delay)
  });
  assert.equal(result.status, "published");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("does not retry permanent failures and throws after transient limit", async () => {
  let permanentCalls = 0;
  await assert.rejects(() => publish({
    generate: async () => {
      permanentCalls += 1;
      throw new GenerationError("authentication", false);
    }
  }), (error) => error.errorCode === "authentication");
  assert.equal(permanentCalls, 1);

  let transientCalls = 0;
  await assert.rejects(() => publish({
    generate: async () => {
      transientCalls += 1;
      throw new GenerationError("provider_5xx", true);
    }
  }), (error) => error.errorCode === "provider_5xx");
  assert.equal(transientCalls, 3);
});
