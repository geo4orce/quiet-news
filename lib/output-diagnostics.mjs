// Only fixed codes and numeric positions leave validation. Error messages may
// contain arbitrary model field names or candidate IDs and must never be logged.
const RULES = [
  [/^sift must decide /, "missing_candidate_decision"],
  [/^sift\.stories\[\d+\]\.sources must come from the discovery candidate$/, "source_mismatch"],
  [/^sift\.(?:stories|rejections)\[\d+\]\.candidate_id cannot be decided more than once$/, "duplicate_candidate_decision"],
  [/^sift\.(?:stories|rejections)\[\d+\]\.candidate_id must identify a discovery candidate$/, "unknown_candidate"],
  [/^sift\.rejections\[\d+\]\.code is not recognized$/, "invalid_rejection_code"],
  [/^sift\.stories\[\d+\]\.(?:headline|body) cannot exceed \d+ characters$/, "text_length_limit"],
  [/^sift\.stories cannot contain more than \d+ items$/, "story_limit"],
  [/^sift\.rejections exceeds the candidate pool boundary$/, "rejection_limit"]
];

export function outputFailureDetails(error, phase) {
  if (phase !== "validation") return { phase, issues: [] };
  if (error?.errorCode === "private_story_limit") {
    return { phase, issues: [{ code: "private_story_limit" }] };
  }
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const issues = errors.slice(0, 20).map(message => {
    const code = typeof message === "string"
      ? RULES.find(([pattern]) => pattern.test(message))?.[1] || "invalid_structure"
      : "invalid_structure";
    const position = typeof message === "string" && code !== "invalid_structure"
      ? message.match(/^sift\.(stories|rejections)\[(\d{1,2})\]/) : null;
    return { code, ...(position ? { list: position[1], index: Number(position[2]) } : {}) };
  });
  if (!issues.length) issues.push({ code: "validation_failed" });
  return { phase, issues, ...(errors.length > 20 ? { omittedIssueCount: errors.length - 20 } : {}) };
}

export function outputFailureSummary(details) {
  if (!details) return "";
  return ` ${details.phase}: ${details.issues.map(issue =>
    `${issue.code}${issue.list ? ` (${issue.list}[${issue.index}])` : ""}`).join(", ") || "no valid output"}.`;
}
