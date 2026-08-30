import test from "node:test";
import assert from "node:assert/strict";
import { publishDailyEdition } from "../lib/publisher.mjs";

function quietLogger() {
  return { info() {}, warn() {} };
}

function fakeStore(overrides = {}) {
  return {
    hasEdition: async () => false,
    readEdition: async () => null,
    publish: async () => {},
    ...overrides
  };
}

function publish(options = {}) {
  return publishDailyEdition({
    store: fakeStore(),
    generate: async () => ({ edition: { stories: [] }, metadata: { responseId: "resp_test" } }),
    now: () => new Date("2026-08-16T08:07:00.000Z"),
    logger: quietLogger(),
    ...options
  });
}

test("publishes the completed previous New York day", async () => {
  let written;
  let input;
  let priorDate;
  const result = await publish({
    store: fakeStore({
      readEdition: async (date) => { priorDate = date; return null; },
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
  assert.equal(priorDate, "2026-08-14");
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

test("a failed generation changes no publication files", async () => {
  let published = false;
  await assert.rejects(() => publish({
    store: fakeStore({ publish: async () => { published = true; } }),
    generate: async () => {
      throw new Error("generation failed");
    }
  }), /generation failed/);
  assert.equal(published, false);
});
