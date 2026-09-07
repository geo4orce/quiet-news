import test from "node:test";
import assert from "node:assert/strict";
import { generationSummary } from "../lib/generation-summary.mjs";

test("summarizes counts using only known rejection labels", () => {
  const lines = generationSummary("2026-09-05", {
    discovery: { candidateCount: 12, candidates: [{ title: "Private candidate" }] },
    sift: {
      acceptedCount: 2,
      rejectedCount: 10,
      rejectionCounts: {
        insufficient_materiality: 4, narrow_interest: 4, incremental_update: 2,
        weak_support: 0, "Private candidate": 1
      }
    }
  });
  assert.deepEqual(lines, [
    "Quiet News (2026-09-05): 12 candidates, 2 published, 10 rejected",
    "Rejections: 4 insufficient materiality, 4 narrow interest, 2 incremental update"
  ]);
  assert.doesNotMatch(lines.join("\n"), /Private candidate|weak support/);
});

test("handles quiet days and missing metadata without invented counts", () => {
  assert.deepEqual(generationSummary("2026-09-05", {
    discovery: { candidateCount: 0 },
    sift: { acceptedCount: 0, rejectedCount: 0, rejectionCounts: {} }
  }), [
    "Quiet News (2026-09-05): 0 candidates, 0 published, 0 rejected",
    "Rejections: none"
  ]);
  assert.deepEqual(generationSummary("2026-09-05", {}), []);
});
