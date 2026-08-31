import test from "node:test";
import assert from "node:assert/strict";
import {
  assertEdition,
  EditionValidationError,
  MAX_PUBLIC_STORIES,
  validateEdition
} from "../lib/edition.mjs";

function story(index = 1) {
  return {
    headline: `Headline ${index}`,
    body: `Concise story body ${index}.`,
    sources: [{ name: "Example", url: `https://example.com/${index}` }]
  };
}

test("accepts empty results and the public safety boundary", () => {
  assert.deepEqual(validateEdition({ stories: [] }), []);
  assert.deepEqual(validateEdition({
    stories: Array.from({ length: MAX_PUBLIC_STORIES }, (_, index) => story(index))
  }), []);
});

test("rejects content beyond the public safety boundary", () => {
  const tooMany = validateEdition({
    stories: Array.from({ length: MAX_PUBLIC_STORIES + 1 }, (_, index) => story(index))
  });
  assert.ok(tooMany.some((error) => error.includes(`more than ${MAX_PUBLIC_STORIES}`)));

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
