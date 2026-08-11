import test from "node:test";
import assert from "node:assert/strict";
import {
  ATTEMPT_COUNT_SQL,
  createPublisherDatabase
} from "../functions/lib/publisher-database.mjs";

function scriptedClient(results) {
  const calls = [];
  let index = 0;
  return {
    calls,
    released: false,
    async query(text, values) {
      calls.push({ text, values });
      const result = results[index++];
      return result || {};
    },
    release() { this.released = true; }
  };
}

test("the daily count includes started, failed, and successful attempts", () => {
  assert.doesNotMatch(ATTEMPT_COUNT_SQL, /status\s*=/i);
  assert.match(ATTEMPT_COUNT_SQL, /COUNT\(\*\)/);
});

test("reserves an attempt under a date-scoped lock when below 12", async () => {
  const client = scriptedClient([
    {},
    {},
    { rows: [{ count: 11 }] },
    { rows: [{ id: 12 }] },
    {}
  ]);
  const database = createPublisherDatabase({
    connect: async () => client,
    query: async () => ({ rows: [] })
  });

  const id = await database.reserveAttempt({
    attemptDay: "2026-08-11",
    model: "model",
    promptVersion: "v1"
  });

  assert.equal(id, 12);
  assert.equal(client.calls[0].text, "BEGIN");
  assert.match(client.calls[1].text, /pg_advisory_xact_lock/);
  assert.match(client.calls[3].text, /INSERT INTO generation_attempts/);
  assert.equal(client.calls[4].text, "COMMIT");
  assert.equal(client.released, true);
});

test("stops before insertion when 12 crashed or completed attempts exist", async () => {
  const client = scriptedClient([{}, {}, { rows: [{ count: 12 }] }, {}]);
  const database = createPublisherDatabase({
    connect: async () => client,
    query: async () => ({ rows: [] })
  });
  const id = await database.reserveAttempt({
    attemptDay: "2026-08-11",
    model: "model",
    promptVersion: "v1"
  });
  assert.equal(id, null);
  assert.equal(client.calls.some(({ text }) => /INSERT INTO/.test(text)), false);
  assert.equal(client.calls.at(-1).text, "COMMIT");
});

test("publishes the edition and marks success in one transaction", async () => {
  const client = scriptedClient([
    {},
    { rowCount: 1, rows: [{ id: 7 }] },
    { rows: [{ id: 20, created_at: new Date("2026-08-11T12:00:00Z") }] },
    {}
  ]);
  const database = createPublisherDatabase({
    connect: async () => client,
    query: async () => ({ rows: [] })
  });
  const result = await database.publishEdition(7, { stories: [] }, {
    responseId: "resp",
    requestId: "req",
    inputTokens: 1,
    outputTokens: 2,
    webSearchCalls: 1
  });
  assert.equal(result.id, 20);
  assert.match(client.calls[1].text, /status = 'succeeded'/);
  assert.match(client.calls[2].text, /INSERT INTO editions/);
  assert.equal(client.calls[3].text, "COMMIT");
});

test("rolls back and releases the connection after a transaction error", async () => {
  const client = scriptedClient([{}, {}, { rows: [{ count: 0 }] }]);
  const originalQuery = client.query.bind(client);
  client.query = async (text, values) => {
    if (/INSERT INTO generation_attempts/.test(text)) throw new Error("insert failed");
    return originalQuery(text, values);
  };
  const database = createPublisherDatabase({
    connect: async () => client,
    query: async () => ({ rows: [] })
  });
  await assert.rejects(() => database.reserveAttempt({
    attemptDay: "2026-08-11",
    model: "model",
    promptVersion: "v1"
  }));
  assert.equal(client.calls.at(-1).text, "ROLLBACK");
  assert.equal(client.released, true);
});
