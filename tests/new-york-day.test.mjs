import test from "node:test";
import assert from "node:assert/strict";
import { newYorkDay, newYorkLocalTime, publicationWindow } from "../lib/new-york-day.mjs";

test("uses New York dates across daylight-saving boundaries", () => {
  assert.equal(newYorkDay("2026-03-08T04:59:59Z"), "2026-03-07");
  assert.equal(newYorkDay("2026-03-08T05:00:00Z"), "2026-03-08");
  assert.equal(newYorkDay("2026-11-01T03:59:59Z"), "2026-10-31");
  assert.equal(newYorkDay("2026-11-01T04:00:00Z"), "2026-11-01");
});

test("builds the previous-day publication window", () => {
  assert.deepEqual(publicationWindow("2026-08-16T08:07:00.000Z"), {
    editionDay: "2026-08-15",
    publishedAt: "2026-08-16T08:07:00.000Z",
    expiresAt: "2026-08-17T09:00:00.000Z"
  });
  assert.equal(newYorkLocalTime("2026-03-08", 5).toISOString(), "2026-03-08T09:00:00.000Z");
  assert.equal(newYorkLocalTime("2026-11-01", 5).toISOString(), "2026-11-01T10:00:00.000Z");
});
