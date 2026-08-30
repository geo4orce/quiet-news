import test from "node:test";
import assert from "node:assert/strict";
import {
  editionFromSiftResult,
  MAX_SIFT_BODY_LENGTH,
  MAX_SIFT_HEADLINE_LENGTH,
  SiftResultValidationError,
  validateSiftResult
} from "../lib/sift-result.mjs";

function candidate(index) {
  return {
    candidate_id: `candidate-${String(index).padStart(2, "0")}`,
    event_date: "2026-08-21",
    title: `Candidate ${index}`,
    summary: `Summary ${index}`,
    category: "world",
    geography: "Global",
    sources: [{ name: "Example", url: `https://example.com/${index}` }]
  };
}

const candidateSet = {
  target_date: "2026-08-21",
  candidates: Array.from({ length: 5 }, (_, index) => candidate(index + 1))
};

const story = (index) => ({
  candidate_id: `candidate-${String(index).padStart(2, "0")}`,
  headline: `Factual title ${index}`,
  body: `Plain body ${index}.`,
  sources: [{ name: "Example", url: `https://example.com/${index}` }]
});

test("accepts zero through five stories while deciding every candidate", () => {
  const quiet = {
    stories: [],
    rejections: candidateSet.candidates.map(({ candidate_id }) => ({
      candidate_id,
      code: "insufficient_materiality"
    }))
  };
  const full = { stories: Array.from({ length: 5 }, (_, index) => story(index + 1)), rejections: [] };
  assert.deepEqual(validateSiftResult(quiet, candidateSet), []);
  assert.deepEqual(validateSiftResult(full, candidateSet), []);
  assert.deepEqual(editionFromSiftResult(quiet, candidateSet), { stories: [] });
  assert.equal(editionFromSiftResult(full, candidateSet).stories.length, 5);
});

test("rejects missing decisions, duplicate decisions, and invented sources", () => {
  const value = {
    stories: [{
      ...story(1),
      sources: [{ name: "Invented", url: "https://invented.example/story" }]
    }],
    rejections: [{ candidate_id: "candidate-01", code: "weak_support" }]
  };
  const errors = validateSiftResult(value, candidateSet);
  assert.ok(errors.some((error) => error.includes("must come from")));
  assert.ok(errors.some((error) => error.includes("more than once")));
  assert.ok(errors.some((error) => error.includes("must decide candidate-02")));
});

test("rejects runaway accepted story text", () => {
  const value = {
    stories: [{
      ...story(1),
      headline: "H".repeat(MAX_SIFT_HEADLINE_LENGTH + 1),
      body: "B".repeat(MAX_SIFT_BODY_LENGTH + 1)
    }],
    rejections: candidateSet.candidates.slice(1).map(({ candidate_id }) => ({
      candidate_id,
      code: "insufficient_materiality"
    }))
  };
  const errors = validateSiftResult(value, candidateSet);
  assert.ok(errors.some((error) => error.includes("headline cannot exceed")));
  assert.ok(errors.some((error) => error.includes("body cannot exceed")));
});

test("editorial length targets remain soft", () => {
  const paragraph = Array.from({ length: 130 }, () => "context").join(" ");
  const value = {
    stories: [{
      ...story(1),
      headline: "A factual headline may run longer when clarity genuinely requires it",
      body: `${paragraph}\n\n${paragraph}`
    }],
    rejections: candidateSet.candidates.slice(1).map(({ candidate_id }) => ({
      candidate_id,
      code: "insufficient_materiality"
    }))
  };
  assert.deepEqual(validateSiftResult(value, candidateSet), []);
});

test("uses a sanitized typed sift error", () => {
  assert.throws(
    () => editionFromSiftResult({ stories: [], rejections: [] }, candidateSet),
    (error) => error instanceof SiftResultValidationError
      && error.message === "Quiet sift result is invalid"
  );
});
