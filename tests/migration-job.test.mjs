import assert from "node:assert/strict";
import { test } from "node:test";
import { runMigrationJob } from "../jobs/migrate.mjs";

test("the migration job applies the schema and closes its pool", async () => {
  const calls = [];

  class PoolStub {
    constructor(configuration) {
      calls.push(["construct", configuration]);
    }

    async query(sql) {
      calls.push(["query", sql]);
    }

    async end() {
      calls.push(["end"]);
    }
  }

  await runMigrationJob({
    databaseUrl: "postgresql://example.invalid/quiet_news",
    PoolClass: PoolStub,
    log: { info: () => {} }
  });

  assert.equal(calls[0][0], "construct");
  assert.equal(calls[0][1].connectionString, "postgresql://example.invalid/quiet_news");
  assert.match(calls[1][1], /CREATE TABLE IF NOT EXISTS generation_attempts/);
  assert.match(calls[1][1], /CREATE TABLE IF NOT EXISTS editions/);
  assert.deepEqual(calls.at(-1), ["end"]);
});

test("the migration job closes its pool after a query failure", async () => {
  let closed = false;

  class PoolStub {
    async query() {
      throw new Error("query failed");
    }

    async end() {
      closed = true;
    }
  }

  await assert.rejects(
    runMigrationJob({
      databaseUrl: "postgresql://example.invalid/quiet_news",
      PoolClass: PoolStub,
      log: { info: () => {} }
    }),
    /query failed/
  );
  assert.equal(closed, true);
});
