import test from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot } from "../scripts/snapshot.mjs";

function story(index = 1) {
  return {
    id: `story-${index}`,
    headline: `A sufficiently descriptive headline ${index}`,
    summary: "This summary contains enough detail to explain the selected news story clearly.",
    since_yesterday: "The material facts changed in a clear and specific way since yesterday.",
    status: "developing",
    sources: [
      {
        name: "Example source",
        url: `https://example.com/story-${index}`,
        published_at: "2026-08-09T10:00:00Z"
      }
    ]
  };
}

test("accepts a preview snapshot", () => {
  const errors = validateSnapshot({
    schema_version: 1,
    state: "preview",
    edition_date: null,
    published_at: null,
    timezone: "America/New_York",
    empty_message: "The first edition is being prepared.",
    stories: []
  });

  assert.deepEqual(errors, []);
});

test("accepts a published edition with five stories", () => {
  const errors = validateSnapshot({
    schema_version: 1,
    state: "published",
    edition_date: "2026-08-09",
    published_at: "2026-08-09T10:00:00Z",
    timezone: "America/New_York",
    empty_message: "No stories met the editorial threshold for this edition.",
    stories: Array.from({ length: 5 }, (_, index) => story(index + 1))
  });

  assert.deepEqual(errors, []);
});

test("rejects more than five stories", () => {
  const errors = validateSnapshot({
    schema_version: 1,
    state: "published",
    edition_date: "2026-08-09",
    published_at: "2026-08-09T10:00:00Z",
    timezone: "America/New_York",
    empty_message: "No stories met the editorial threshold for this edition.",
    stories: Array.from({ length: 6 }, (_, index) => story(index + 1))
  });

  assert.ok(errors.includes("stories cannot contain more than five items"));
});

test("requires source links and comparison text", () => {
  const invalid = story();
  invalid.sources = [];
  invalid.since_yesterday = "short";

  const errors = validateSnapshot({
    schema_version: 1,
    state: "published",
    edition_date: "2026-08-09",
    published_at: "2026-08-09T10:00:00Z",
    timezone: "America/New_York",
    empty_message: "No stories met the editorial threshold for this edition.",
    stories: [invalid]
  });

  assert.ok(errors.some((error) => error.includes("since_yesterday")));
  assert.ok(errors.some((error) => error.includes("sources")));
});
