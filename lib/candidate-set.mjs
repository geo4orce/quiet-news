import { isCalendarDay } from "./new-york-day.mjs";

const CANDIDATE_SET_FIELDS = new Set(["target_date", "candidates"]);
const CANDIDATE_FIELDS = new Set([
  "candidate_id",
  "event_date",
  "title",
  "summary",
  "category",
  "geography",
  "sources"
]);
const SOURCE_FIELDS = new Set(["name", "url"]);

const sourceSchema = {
  type: "object",
  additionalProperties: false,
  required: ["name", "url"],
  properties: {
    name: { type: "string", minLength: 1 },
    url: { type: "string", pattern: "^https://" }
  }
};

export const CANDIDATE_SET_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["target_date", "candidates"],
  properties: {
    target_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    candidates: {
      type: "array",
      minItems: 0,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [...CANDIDATE_FIELDS],
        properties: {
          candidate_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{0,63}$" },
          event_date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          title: { type: "string", minLength: 1 },
          summary: { type: "string", minLength: 1 },
          category: { type: "string", minLength: 1 },
          geography: { type: "string", minLength: 1 },
          sources: {
            type: "array",
            minItems: 1,
            items: sourceSchema
          }
        }
      }
    }
  }
};

export class CandidateSetValidationError extends Error {
  constructor(errors) {
    super("Discovery result is invalid");
    this.name = "CandidateSetValidationError";
    this.errors = errors;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

function isAbsoluteHttpsUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function findUnknownFields(value, allowedFields, path, errors) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) errors.push(`${path}.${field} is not allowed`);
  }
}

export function validateCandidateSet(value, { targetDay } = {}) {
  const errors = [];
  if (!isObject(value)) return ["discovery result must be an object"];

  findUnknownFields(value, CANDIDATE_SET_FIELDS, "discovery", errors);
  if (!isCalendarDay(value.target_date)) {
    errors.push("discovery.target_date must be a YYYY-MM-DD calendar date");
  } else if (targetDay !== undefined && value.target_date !== targetDay) {
    errors.push("discovery.target_date must match the requested day");
  }
  if (!Array.isArray(value.candidates)) {
    errors.push("discovery.candidates must be an array");
    return errors;
  }
  if (value.candidates.length > 20) {
    errors.push("discovery.candidates cannot contain more than 20 items");
  }

  const candidateIds = new Set();
  value.candidates.forEach((candidate, candidateIndex) => {
    const candidatePath = `discovery.candidates[${candidateIndex}]`;
    if (!isObject(candidate)) {
      errors.push(`${candidatePath} must be an object`);
      return;
    }
    findUnknownFields(candidate, CANDIDATE_FIELDS, candidatePath, errors);
    for (const field of ["candidate_id", "title", "summary", "category", "geography"]) {
      if (!isNonEmptyString(candidate[field])) {
        errors.push(`${candidatePath}.${field} must be a non-empty string`);
      }
    }
    if (isNonEmptyString(candidate.candidate_id)) {
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(candidate.candidate_id)) {
        errors.push(`${candidatePath}.candidate_id has an invalid format`);
      }
      if (candidateIds.has(candidate.candidate_id)) {
        errors.push(`${candidatePath}.candidate_id must be unique`);
      }
      candidateIds.add(candidate.candidate_id);
    }
    if (!isCalendarDay(candidate.event_date)) {
      errors.push(`${candidatePath}.event_date must be a YYYY-MM-DD calendar date`);
    } else if (isCalendarDay(value.target_date) && candidate.event_date !== value.target_date) {
      errors.push(`${candidatePath}.event_date must match discovery.target_date`);
    }
    if (!Array.isArray(candidate.sources) || candidate.sources.length === 0) {
      errors.push(`${candidatePath}.sources must be a non-empty array`);
      return;
    }
    candidate.sources.forEach((source, sourceIndex) => {
      const sourcePath = `${candidatePath}.sources[${sourceIndex}]`;
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

export function assertCandidateSet(value, options) {
  const errors = validateCandidateSet(value, options);
  if (errors.length > 0) throw new CandidateSetValidationError(errors);
  return value;
}
