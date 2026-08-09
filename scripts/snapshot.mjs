const STORY_STATUSES = new Set([
  "new",
  "developing",
  "no_material_change"
]);

export class SnapshotValidationError extends Error {
  constructor(errors) {
    super(`Snapshot validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "SnapshotValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value, minimum = 1, maximum = Infinity) {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.trim().length <= maximum
  );
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function isTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isHttpsUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function validateStory(story, index, errors, ids) {
  const path = `stories[${index}]`;

  if (!isObject(story)) {
    errors.push(`${path} must be an object`);
    return;
  }

  if (
    !isNonEmptyString(story.id, 3, 80) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.id)
  ) {
    errors.push(`${path}.id must be a lowercase hyphenated identifier`);
  } else if (ids.has(story.id)) {
    errors.push(`${path}.id must be unique`);
  } else {
    ids.add(story.id);
  }

  if (!isNonEmptyString(story.headline, 8, 140)) {
    errors.push(`${path}.headline must contain 8 to 140 characters`);
  }

  if (!isNonEmptyString(story.summary, 20, 700)) {
    errors.push(`${path}.summary must contain 20 to 700 characters`);
  }

  if (!isNonEmptyString(story.since_yesterday, 10, 350)) {
    errors.push(`${path}.since_yesterday must contain 10 to 350 characters`);
  }

  if (!STORY_STATUSES.has(story.status)) {
    errors.push(
      `${path}.status must be new, developing, or no_material_change`
    );
  }

  if (!Array.isArray(story.sources) || story.sources.length < 1 || story.sources.length > 5) {
    errors.push(`${path}.sources must contain between one and five sources`);
    return;
  }

  story.sources.forEach((source, sourceIndex) => {
    const sourcePath = `${path}.sources[${sourceIndex}]`;
    if (!isObject(source)) {
      errors.push(`${sourcePath} must be an object`);
      return;
    }
    if (!isNonEmptyString(source.name, 2, 80)) {
      errors.push(`${sourcePath}.name must contain 2 to 80 characters`);
    }
    if (!isHttpsUrl(source.url)) {
      errors.push(`${sourcePath}.url must be a valid HTTPS URL`);
    }
    if (source.published_at !== undefined && !isTimestamp(source.published_at)) {
      errors.push(`${sourcePath}.published_at must be an ISO timestamp when present`);
    }
  });
}

export function validateSnapshot(value, { kind = "published" } = {}) {
  const errors = [];

  if (!isObject(value)) {
    return ["snapshot must be an object"];
  }

  if (value.schema_version !== 1) {
    errors.push("schema_version must equal 1");
  }

  if (value.timezone !== "America/New_York") {
    errors.push("timezone must equal America/New_York");
  }

  if (!Array.isArray(value.stories)) {
    errors.push("stories must be an array");
  } else {
    if (value.stories.length > 5) {
      errors.push("stories cannot contain more than five items");
    }
    const ids = new Set();
    value.stories.forEach((story, index) => validateStory(story, index, errors, ids));
    if (value.stories.length === 0 && !isNonEmptyString(value.empty_message, 10, 180)) {
      errors.push("empty_message must contain 10 to 180 characters when there are no stories");
    }
  }

  if (kind === "draft") {
    if (typeof value.ready !== "boolean") {
      errors.push("ready must be a boolean in a draft");
    }
    if (!isDate(value.edition_date)) {
      errors.push("edition_date must be a valid YYYY-MM-DD date in a draft");
    }
    return errors;
  }

  if (value.state !== "preview" && value.state !== "published") {
    errors.push("state must be preview or published");
  }

  if (value.state === "preview") {
    if (value.edition_date !== null || value.published_at !== null) {
      errors.push("preview editions must have null edition_date and published_at");
    }
  }

  if (value.state === "published") {
    if (!isDate(value.edition_date)) {
      errors.push("published edition_date must be a valid YYYY-MM-DD date");
    }
    if (!isTimestamp(value.published_at)) {
      errors.push("published_at must be an ISO timestamp");
    }
  }

  return errors;
}

export function assertValidSnapshot(value, options) {
  const errors = validateSnapshot(value, options);
  if (errors.length > 0) {
    throw new SnapshotValidationError(errors);
  }
  return value;
}

export function statusLabel(status) {
  return {
    new: "New",
    developing: "Developing",
    no_material_change: "No material change"
  }[status] ?? status;
}
