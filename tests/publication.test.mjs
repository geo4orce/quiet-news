import test from "node:test";
import assert from "node:assert/strict";
import {
  createPublication,
  createPublicationIndex,
  validatePublication,
  validatePublicationIndex
} from "../lib/publication.mjs";

function publication(overrides = {}) {
  return {
    edition_date: "2026-08-15",
    published_at: "2026-08-16T08:07:00.000Z",
    expires_at: "2026-08-17T09:00:00.000Z",
    stories: [],
    ...overrides
  };
}

test("creates the public publication contract", () => {
  assert.deepEqual(createPublication({
    editionDay: "2026-08-15",
    publishedAt: "2026-08-16T08:07:00.000Z",
    expiresAt: "2026-08-17T09:00:00.000Z"
  }, { stories: [] }), publication());
});

test("rejects unknown fields, invalid dates, and invalid stories", () => {
  const errors = validatePublication(publication({
    edition_date: "2026-02-30",
    expires_at: "not-an-instant",
    extra: true,
    stories: [{ headline: "", body: "Body" }]
  }));
  assert.ok(errors.some((error) => error.includes("extra")));
  assert.ok(errors.some((error) => error.includes("edition_date")));
  assert.ok(errors.some((error) => error.includes("expires_at")));
  assert.ok(errors.some((error) => error.includes("headline")));
});

test("creates a unique newest-first archive index", () => {
  assert.deepEqual(createPublicationIndex("2026-08-16T08:07:00.000Z", [
    "2026-08-14", "2026-08-15", "2026-08-14"
  ]), {
    updated_at: "2026-08-16T08:07:00.000Z",
    dates: ["2026-08-15", "2026-08-14"]
  });
  assert.ok(validatePublicationIndex({
    updated_at: "2026-08-16T08:07:00.000Z",
    dates: ["2026-08-14", "2026-08-15"]
  }).some((error) => error.includes("newest first")));
});
