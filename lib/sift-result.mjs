import { assertEdition, MAX_PUBLIC_STORIES, validateEdition } from "./edition.mjs";

const SIFT_FIELDS = new Set(["stories", "rejections"]);
const SIFT_STORY_FIELDS = new Set(["candidate_id", "headline", "body", "sources"]);
const REJECTION_FIELDS = new Set(["candidate_id", "code"]);

export const MAX_SIFT_HEADLINE_LENGTH = 120;
export const MAX_SIFT_BODY_LENGTH = 3000;

export const REJECTION_CODES = [
  "outside_target_day",
  "insufficient_materiality",
  "narrow_interest",
  "incremental_update",
  "duplicate_event",
  "prior_day_repetition",
  "weak_support",
  "speculative_or_sensational",
  "displaced_by_stronger_story"
];

export const SIFT_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["stories", "rejections"],
  properties: {
    stories: {
      type: "array",
      minItems: 0,
      maxItems: MAX_PUBLIC_STORIES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "headline", "body", "sources"],
        properties: {
          candidate_id: { type: "string" },
          headline: { type: "string", minLength: 1, maxLength: MAX_SIFT_HEADLINE_LENGTH },
          body: { type: "string", minLength: 1, maxLength: MAX_SIFT_BODY_LENGTH },
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
    },
    rejections: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidate_id", "code"],
        properties: {
          candidate_id: { type: "string" },
          code: { type: "string", enum: REJECTION_CODES }
        }
      }
    }
  }
};

export class SiftResultValidationError extends Error {
  constructor(errors) {
    super("Quiet sift result is invalid");
    this.name = "SiftResultValidationError";
    this.errors = errors;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function findUnknownFields(value, allowedFields, path, errors) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not allowed`);
  }
}

function publicStory(story) {
  return {
    headline: story.headline,
    body: story.body,
    sources: story.sources
  };
}

export function validateSiftResult(value, candidateSet) {
  const errors = [];
  if (!isObject(value)) return ["sift result must be an object"];

  findUnknownFields(value, SIFT_FIELDS, "sift", errors);
  if (!Array.isArray(value.stories)) errors.push("sift.stories must be an array");
  if (!Array.isArray(value.rejections)) errors.push("sift.rejections must be an array");
  if (!Array.isArray(value.stories) || !Array.isArray(value.rejections)) return errors;
  if (value.stories.length > MAX_PUBLIC_STORIES) {
    errors.push(`sift.stories cannot contain more than ${MAX_PUBLIC_STORIES} items`);
  }
  if (value.rejections.length > 20) {
    errors.push("sift.rejections cannot contain more than 20 items");
  }

  const candidates = new Map((candidateSet?.candidates || []).map((candidate) => [
    candidate.candidate_id,
    candidate
  ]));
  const decidedIds = new Set();

  value.stories.forEach((story, storyIndex) => {
    const storyPath = `sift.stories[${storyIndex}]`;
    if (!isObject(story)) {
      errors.push(`${storyPath} must be an object`);
      return;
    }
    findUnknownFields(story, SIFT_STORY_FIELDS, storyPath, errors);
    if (typeof story.headline === "string" && story.headline.length > MAX_SIFT_HEADLINE_LENGTH) {
      errors.push(`${storyPath}.headline cannot exceed ${MAX_SIFT_HEADLINE_LENGTH} characters`);
    }
    if (typeof story.body === "string" && story.body.length > MAX_SIFT_BODY_LENGTH) {
      errors.push(`${storyPath}.body cannot exceed ${MAX_SIFT_BODY_LENGTH} characters`);
    }
    const editionErrors = validateEdition({ stories: [publicStory(story)] });
    errors.push(...editionErrors.map((error) => `${storyPath}: ${error}`));
    const candidate = candidates.get(story.candidate_id);
    if (!candidate) {
      errors.push(`${storyPath}.candidate_id must identify a discovery candidate`);
    } else if (Array.isArray(story.sources)) {
      const candidateSources = new Set(candidate.sources.map((source) => `${source.name}\n${source.url}`));
      if (story.sources.some((source) => !candidateSources.has(`${source?.name}\n${source?.url}`))) {
        errors.push(`${storyPath}.sources must come from the discovery candidate`);
      }
    }
    if (decidedIds.has(story.candidate_id)) {
      errors.push(`${storyPath}.candidate_id cannot be decided more than once`);
    }
    decidedIds.add(story.candidate_id);
  });

  value.rejections.forEach((rejection, rejectionIndex) => {
    const rejectionPath = `sift.rejections[${rejectionIndex}]`;
    if (!isObject(rejection)) {
      errors.push(`${rejectionPath} must be an object`);
      return;
    }
    findUnknownFields(rejection, REJECTION_FIELDS, rejectionPath, errors);
    if (!candidates.has(rejection.candidate_id)) {
      errors.push(`${rejectionPath}.candidate_id must identify a discovery candidate`);
    }
    if (!REJECTION_CODES.includes(rejection.code)) {
      errors.push(`${rejectionPath}.code is not recognized`);
    }
    if (decidedIds.has(rejection.candidate_id)) {
      errors.push(`${rejectionPath}.candidate_id cannot be decided more than once`);
    }
    decidedIds.add(rejection.candidate_id);
  });

  for (const candidateId of candidates.keys()) {
    if (!decidedIds.has(candidateId)) errors.push(`sift must decide ${candidateId}`);
  }
  return errors;
}

export function assertSiftResult(value, candidateSet) {
  const errors = validateSiftResult(value, candidateSet);
  if (errors.length > 0) throw new SiftResultValidationError(errors);
  return value;
}

export function editionFromSiftResult(value, candidateSet) {
  assertSiftResult(value, candidateSet);
  return assertEdition({ stories: value.stories.map(publicStory) });
}

export function countRejections(value) {
  const counts = Object.fromEntries(REJECTION_CODES.map((code) => [code, 0]));
  for (const rejection of value.rejections) counts[rejection.code] += 1;
  return counts;
}
