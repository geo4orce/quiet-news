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

for (const count of [0, 1, 5]) {
  test(`accepts an edition with ${count} stories`, () => {
    assert.deepEqual(
      validateEdition({ stories: Array.from({ length: count }, (_, index) => story(index)) }),
      []
    );
  });
}

test("accepts omitted sources", () => {
  const value = story();
  delete value.sources;
  assert.deepEqual(validateEdition({ stories: [value] }), []);
});

test("rejects six stories", () => {
  const errors = validateEdition({
    stories: Array.from({ length: 6 }, (_, index) => story(index))
  });
  assert.ok(errors.includes("edition.stories cannot contain more than five items"));
});

test("rejects missing and empty required story fields", () => {
  const errors = validateEdition({
    stories: [{ headline: "  ", sources: [] }]
  });
  assert.ok(errors.some((error) => error.includes("headline")));
  assert.ok(errors.some((error) => error.includes("body")));
});

test("rejects invalid source metadata and non-HTTPS URLs", () => {
  const errors = validateEdition({
    stories: [{
      headline: "Headline",
      body: "Body",
      sources: [
        { name: "", url: "https://example.com" },
        { name: "Example", url: "http://example.com" },
        { name: "Example" }
      ]
    }]
  });
  assert.equal(errors.filter((error) => error.includes(".name")).length, 1);
  assert.equal(errors.filter((error) => error.includes(".url")).length, 2);
});

test("rejects unknown fields at every contract level", () => {
  const value = story();
  value.summary = "Unknown";
  value.sources[0].published_at = "2026-08-11T00:00:00Z";
  const errors = validateEdition({ stories: [value], schema_version: 1 });
  assert.ok(errors.some((error) => error.includes("schema_version")));
  assert.ok(errors.some((error) => error.includes("summary")));
  assert.ok(errors.some((error) => error.includes("published_at")));
});

test("assertEdition throws a typed error without exposing payload details", () => {
  assert.throws(
    () => assertEdition({ stories: [{ headline: "", body: "private body" }] }),
    (error) => {
      assert.ok(error instanceof EditionValidationError);
      assert.equal(error.message, "Edition payload is invalid");
      assert.doesNotMatch(error.message, /private body/);
      return true;
    }
  );
});
