import { assertEdition } from "./edition.mjs";
import { isCalendarDay } from "./new-york-day.mjs";

const PUBLICATION_FIELDS = new Set([
  "edition_date",
  "published_at",
  "expires_at",
  "stories"
]);
const INDEX_FIELDS = new Set(["updated_at", "dates"]);

export class PublicationValidationError extends Error {
  constructor(errors) {
    super("Publication payload is invalid");
    this.name = "PublicationValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unknownFields(value, allowed, path) {
  return Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => `${path}.${field} is not allowed`);
}

function isIsoInstant(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function validatePublication(value) {
  if (!isObject(value)) return ["publication must be an object"];
  const errors = unknownFields(value, PUBLICATION_FIELDS, "publication");
  if (!isCalendarDay(value.edition_date)) {
    errors.push("publication.edition_date must be a YYYY-MM-DD calendar date");
  }
  if (!isIsoInstant(value.published_at)) {
    errors.push("publication.published_at must be a canonical ISO instant");
  }
  if (!isIsoInstant(value.expires_at)) {
    errors.push("publication.expires_at must be a canonical ISO instant");
  }
  if (isIsoInstant(value.published_at) && isIsoInstant(value.expires_at)
    && value.expires_at <= value.published_at) {
    errors.push("publication.expires_at must be after publication.published_at");
  }
  try {
    assertEdition({ stories: value.stories });
  } catch (error) {
    errors.push(...(error.errors || ["publication.stories is invalid"]));
  }
  return errors;
}

export function assertPublication(value) {
  const errors = validatePublication(value);
  if (errors.length > 0) throw new PublicationValidationError(errors);
  return value;
}

export function createPublication(window, edition) {
  assertEdition(edition);
  return assertPublication({
    edition_date: window.editionDay,
    published_at: window.publishedAt,
    expires_at: window.expiresAt,
    stories: edition.stories
  });
}

export function validatePublicationIndex(value) {
  if (!isObject(value)) return ["index must be an object"];
  const errors = unknownFields(value, INDEX_FIELDS, "index");
  if (!isIsoInstant(value.updated_at)) {
    errors.push("index.updated_at must be a canonical ISO instant");
  }
  if (!Array.isArray(value.dates)) {
    errors.push("index.dates must be an array");
    return errors;
  }
  if (value.dates.some((date) => !isCalendarDay(date))) {
    errors.push("index.dates must contain only YYYY-MM-DD calendar dates");
  }
  if (new Set(value.dates).size !== value.dates.length) {
    errors.push("index.dates cannot contain duplicates");
  }
  const sorted = [...value.dates].sort().reverse();
  if (value.dates.some((date, index) => date !== sorted[index])) {
    errors.push("index.dates must be newest first");
  }
  return errors;
}

export function assertPublicationIndex(value) {
  const errors = validatePublicationIndex(value);
  if (errors.length > 0) throw new PublicationValidationError(errors);
  return value;
}

export function createPublicationIndex(updatedAt, dates) {
  return assertPublicationIndex({
    updated_at: updatedAt,
    dates: [...new Set(dates)].sort().reverse()
  });
}
