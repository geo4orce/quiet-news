const EDITION_FIELDS = new Set(["stories"]);
const STORY_FIELDS = new Set(["headline", "body", "sources"]);
const SOURCE_FIELDS = new Set(["name", "url"]);

export const EDITION_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stories"],
  properties: {
    stories: {
      type: "array",
      minItems: 0,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "body", "sources"],
        properties: {
          headline: { type: "string", minLength: 1 },
          body: { type: "string", minLength: 1 },
          sources: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "url"],
              properties: {
                name: { type: "string", minLength: 1 },
                url: { type: "string", pattern: "^https://" }
              }
            }
          }
        }
      }
    }
  }
};

export class EditionValidationError extends Error {
  constructor(errors) {
    super("Daily result is invalid");
    this.name = "EditionValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function findUnknownFields(value, allowedFields, path, errors) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not allowed`);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isAbsoluteHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function validateEdition(value) {
  const errors = [];
  if (!isObject(value)) return ["result must be an object"];

  findUnknownFields(value, EDITION_FIELDS, "result", errors);
  if (!Array.isArray(value.stories)) {
    errors.push("result.stories must be an array");
    return errors;
  }
  if (value.stories.length > 5) {
    errors.push("result.stories cannot contain more than five items");
  }

  value.stories.forEach((story, storyIndex) => {
    const storyPath = `result.stories[${storyIndex}]`;
    if (!isObject(story)) {
      errors.push(`${storyPath} must be an object`);
      return;
    }
    findUnknownFields(story, STORY_FIELDS, storyPath, errors);
    if (!isNonEmptyString(story.headline)) {
      errors.push(`${storyPath}.headline must be a non-empty string`);
    }
    if (!isNonEmptyString(story.body)) {
      errors.push(`${storyPath}.body must be a non-empty string`);
    }
    if (!Array.isArray(story.sources) || story.sources.length === 0) {
      errors.push(`${storyPath}.sources must be a non-empty array`);
      return;
    }
    story.sources.forEach((source, sourceIndex) => {
      const sourcePath = `${storyPath}.sources[${sourceIndex}]`;
      if (!isObject(source)) {
        errors.push(`${sourcePath} must be an object`);
        return;
      }
      findUnknownFields(source, SOURCE_FIELDS, sourcePath, errors);
      if (!isNonEmptyString(source.name)) {
        errors.push(`${sourcePath}.name must be a non-empty string`);
      }
      if (!isAbsoluteHttpsUrl(source.url)) {
        errors.push(`${sourcePath}.url must be an absolute HTTPS URL`);
      }
    });
  });

  return errors;
}

export function assertEdition(value) {
  const errors = validateEdition(value);
  if (errors.length > 0) throw new EditionValidationError(errors);
  return value;
}
