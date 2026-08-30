import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEdition,
  EditionValidationError,
  validateEdition
} from "../lib/edition.mjs";

function story(index = 1) {
  return {
    headline: `Headline ${index}`,
    body: `Concise story body ${index}.`,
    sources: [{ name: "Example", url: `https://example.com/${index}` }]
  };
}

test("accepts empty and full daily results", () => {
  assert.deepEqual(validateEdition({ stories: [] }), []);
  assert.deepEqual(validateEdition({
    stories: Array.from({ length: 5 }, (_, index) => story(index))
  }), []);
});

test("rejects content outside the small daily contract", () => {
  const tooMany = validateEdition({
    stories: Array.from({ length: 6 }, (_, index) => story(index))
  });
  assert.ok(tooMany.some((error) => error.includes("more than five")));

  const malformed = validateEdition({
    stories: [
      { headline: "", body: "Body", sources: [{ name: "Example", url: "http://example.com" }] },
      { headline: "Missing sources", body: "Body" }
    ],
    extra: true
  });
  assert.ok(malformed.some((error) => error.includes("headline")));
  assert.ok(malformed.some((error) => error.includes("url")));
  assert.ok(malformed.some((error) => error.includes("non-empty array")));
  assert.ok(malformed.some((error) => error.includes("extra")));
});

test("invalid daily results use a sanitized typed error", () => {
  assert.throws(
    () => assertEdition({ stories: [{ headline: "", body: "private body" }] }),
    (error) => {
      assert.ok(error instanceof EditionValidationError);
      assert.equal(error.message, "Daily result is invalid");
      assert.doesNotMatch(error.message, /private body/);
      return true;
    }
  );
});
