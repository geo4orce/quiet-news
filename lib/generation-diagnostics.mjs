import { isCalendarDay } from "./new-york-day.mjs";

const FAILURE_REASONS = {
  provider_5xx: "The provider returned a server error.",
  timeout: "The request timed out.",
  rate_limit: "The provider rate limit was reached.",
  authentication: "The provider rejected authentication.",
  billing: "The provider reported a billing or quota error.",
  provider_request: "The provider rejected the request.",
  network_error: "The provider request failed at the network layer.",
  provider_refusal: "The provider refused the request.",
  incomplete_output: "The provider response was incomplete.",
  malformed_output: "The provider output failed validation.",
  archive_write_failed: "The validated stage could not be archived.",
  checkpoint_write_failed: "The durable checkpoint could not be saved.",
  checkpoint_mismatch: "Saved work does not match this request.",
  invalid_checkpoint: "Saved request coordination is invalid.",
  checkpoint_not_resumable: "The saved request cannot be resumed automatically.",
  submission_outcome_unknown: "Submission outcome is unknown; no duplicate request was started.",
  response_expired: "The provider no longer has this response.",
  response_transport: "The response connection failed.",
  response_id_mismatch: "The retrieved response identifier did not match.",
  polling_unavailable: "The saved response could not be retrieved within the job budget.",
  provider_terminal_failure: "The provider ended this request without a complete result.",
  overall_deadline: "The overall generation deadline was reached.",
  attempt_limit: "The saved request attempt limit was reached.",
  collection_incomplete: "The completed day has not been fully collected."
};

const milliseconds = (value) => Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
const attempts = (value) => Number.isInteger(value) && value >= 0 && value <= 4 ? value : null;

export function safeRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(value)
    && !value.startsWith("sk-") ? value : null;
}

// Project only known diagnostic fields. Never serialize an error or provider body.
export function generationFailureDetails(error) {
  const metadata = error?.metadata || {};
  return {
    code: Object.hasOwn(FAILURE_REASONS, error?.errorCode) ? error.errorCode : "Error",
    stage: ["discovery", "sift"].includes(metadata.stage) ? metadata.stage : null,
    targetDate: isCalendarDay(metadata.targetDate) ? metadata.targetDate : null,
    model: safeRequestId(metadata.model),
    promptVersion: safeRequestId(metadata.promptVersion),
    reasoningEffort: ["low", "medium", "high"].includes(metadata.reasoningEffort) ? metadata.reasoningEffort : null,
    attempts: attempts(metadata.attempts),
    maxAttempts: attempts(metadata.maxAttempts),
    providerAttempts: attempts(metadata.totalProviderAttempts) ?? attempts(metadata.attempts),
    httpStatus: Number.isInteger(metadata.httpStatus) && metadata.httpStatus >= 100
      && metadata.httpStatus <= 599 ? metadata.httpStatus : null,
    requestId: safeRequestId(metadata.requestId),
    attemptDurationMs: milliseconds(metadata.attemptDurationMs),
    durationMs: milliseconds(metadata.durationMs),
    timeoutMs: milliseconds(metadata.timeoutMs),
    timeoutSource: ["client_deadline", "provider_response", "transport"].includes(metadata.timeoutSource)
      ? metadata.timeoutSource : null
  };
}

export function generationFailureSummary(error) {
  const details = generationFailureDetails(error);
  const date = details.targetDate ? ` for ${details.targetDate}` : "";
  const stage = details.stage ? ` during ${details.stage}` : "";
  const count = details.attempts === null ? "" : ` after ${details.attempts} attempt${details.attempts === 1 ? "" : "s"}`;
  let reason = FAILURE_REASONS[details.code] || "Generation could not finish.";
  if (details.timeoutSource === "client_deadline") reason = "Our request deadline expired.";
  if (details.timeoutSource === "provider_response") reason = "The provider returned a timeout response.";
  if (details.timeoutSource === "transport") reason = "The request was aborted by the transport.";
  const status = details.httpStatus === null ? "" : ` HTTP ${details.httpStatus}.`;
  return `Publication${date} failed${stage}${count}. ${reason}${status} No new publication was saved.`;
}
