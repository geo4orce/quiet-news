import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCandidateSet,
  CandidateSetValidationError,
  validateCandidateSet
} from "../lib/candidate-set.mjs";

function candidate(index) {
  return {
    candidate_id: `candidate-${String(index).padStart(2, "0")}`,
    event_date: "2026-08-21",
    title: `Candidate ${index}`,
    summary: `Neutral description ${index}`,
    category: "world",
    geography: "Global",
    sources: [{ name: "Example", url: `https://example.com/${index}` }]
  };
}

test("accepts zero through 20 neutral discovery candidates", () => {
  for (const count of [0, 20]) {
    const value = {
      target_date: "2026-08-21",
      candidates: Array.from({ length: count }, (_, index) => candidate(index + 1))
    };
    assert.deepEqual(validateCandidateSet(value, { targetDay: "2026-08-21" }), []);
  }
});

test("rejects oversized, duplicate, off-day, and unsourced candidates", () => {
  const values = Array.from({ length: 21 }, (_, index) => candidate(index + 1));
  values[1].candidate_id = values[0].candidate_id;
  values[2].event_date = "2026-08-20";
  values[3].sources = [];
  const errors = validateCandidateSet({ target_date: "2026-08-21", candidates: values });
  assert.ok(errors.some((error) => error.includes("more than 20")));
  assert.ok(errors.some((error) => error.includes("unique")));
  assert.ok(errors.some((error) => error.includes("event_date")));
  assert.ok(errors.some((error) => error.includes("non-empty array")));
});

test("uses a sanitized typed discovery error", () => {
  assert.throws(
    () => assertCandidateSet({ target_date: "2026-08-21", candidates: [{ summary: "private" }] }),
    (error) => error instanceof CandidateSetValidationError
      && error.message === "Discovery result is invalid"
      && !error.message.includes("private")
  );
});
