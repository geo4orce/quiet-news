import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(
  new URL("../database/migrations/001_initial.sql", import.meta.url),
  "utf8"
);

test("migration creates the attempt ledger and immutable edition store", () => {
  assert.match(sql, /CREATE TABLE generation_attempts/);
  assert.match(sql, /CHECK \(status IN \('started', 'succeeded', 'failed'\)\)/);
  assert.match(sql, /CREATE TABLE editions/);
  assert.match(sql, /generation_attempt_id BIGINT NOT NULL UNIQUE/);
  assert.match(sql, /payload JSONB NOT NULL/);
  assert.doesNotMatch(sql, /UPDATE editions|DELETE FROM editions/i);
});
