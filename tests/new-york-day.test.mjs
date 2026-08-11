import test from "node:test";
import assert from "node:assert/strict";
import { newYorkDay } from "../functions/lib/new-york-day.mjs";

test("uses the New York date across the spring daylight-saving boundary", () => {
  assert.equal(newYorkDay("2026-03-08T04:59:59Z"), "2026-03-07");
  assert.equal(newYorkDay("2026-03-08T05:00:00Z"), "2026-03-08");
});

test("uses the New York date across the fall daylight-saving boundary", () => {
  assert.equal(newYorkDay("2026-11-01T03:59:59Z"), "2026-10-31");
  assert.equal(newYorkDay("2026-11-01T04:00:00Z"), "2026-11-01");
});

test("rejects an invalid date", () => {
  assert.throws(() => newYorkDay("not a date"), /valid date/);
});
