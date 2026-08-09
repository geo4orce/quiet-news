import test from "node:test";
import assert from "node:assert/strict";
import { createMockSnapshot, mockCountFromSearch } from "../mock-data.js";
import { validateSnapshot } from "../scripts/snapshot.mjs";

test("recognizes only mock values from zero to five", () => {
  assert.equal(mockCountFromSearch("?mock=0"), 0);
  assert.equal(mockCountFromSearch("?mock=5"), 5);
  assert.equal(mockCountFromSearch("?mock=6"), null);
  assert.equal(mockCountFromSearch("?mock=hello"), null);
  assert.equal(mockCountFromSearch(""), null);
});

test("creates valid mock snapshots at both layout limits", () => {
  const now = new Date("2026-08-09T19:00:00Z");
  const empty = createMockSnapshot(0, now);
  const full = createMockSnapshot(5, now);

  assert.equal(empty.stories.length, 0);
  assert.equal(full.stories.length, 5);
  assert.deepEqual(validateSnapshot(empty), []);
  assert.deepEqual(validateSnapshot(full), []);
});
