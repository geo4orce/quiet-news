import { createHash, randomUUID } from "node:crypto";
import { GenerationError, httpError, outputText, responseMetadata } from "./openai-generator.mjs";
import { safeRequestId } from "./generation-diagnostics.mjs";
import { generationFailureDetails } from "./generation-diagnostics.mjs";

const URL = "https://api.openai.com/v1/responses";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validId = (id) => typeof id === "string" && /^resp_[a-zA-Z0-9_-]{1,200}$/.test(id);
export const requestFingerprint = (body) => createHash("sha256").update(JSON.stringify(body)).digest("hex");

// Only request coordination and validated outputs leave this module. Never persist
// a complete provider response, private prompt, or reasoning item.
async function runBackgroundResponse({
  apiKey, body, stage, targetDate, request = null, saveRequest, validate,
  fetchImpl = globalThis.fetch, nowMs = Date.now, sleep = wait, logger = console,
  softTimeoutMs = 300_000, hardTimeoutMs = 840_000, pollMs = 5_000,
  networkTimeoutMs = 30_000, maxAttempts = 2, promptVersion
}) {
  if (!apiKey || typeof saveRequest !== "function") throw new Error("Checkpoint configuration missing");
  const payload = { ...body, background: true, store: false };
  const fingerprint = requestFingerprint(payload);
  if (request && request.fingerprint !== fingerprint) throw new GenerationError("checkpoint_mismatch", false, { stage });
  if (request && (!Number.isInteger(request.attempts) || request.attempts < 1 || request.attempts > maxAttempts
    || !Number.isFinite(Date.parse(request.startedAt))
    || !["submitting", "unknown", "failed", "queued", "in_progress", "completed", "expired", "cancelled"].includes(request.status))) {
    throw new GenerationError("invalid_checkpoint", false, { stage });
  }
  const started = nowMs();
  let state = request ? structuredClone(request) : null;
  let warned = false;
  const log = (event, extra = {}) => logger.info?.(JSON.stringify({ event, stage, targetDate, ...extra }));
  const persist = async (next) => {
    try { await saveRequest(structuredClone(next)); }
    catch { throw new GenerationError("checkpoint_write_failed", false, { stage }); }
    state = next;
  };
  const failure = (code, extra = {}) => new GenerationError(code, false, {
    stage, targetDate, attempts: state?.attempts || 0,
    responseId: state?.responseId || null, model: body.model, promptVersion,
    reasoningEffort: body.reasoning.effort, durationMs: Math.max(0, nowMs() - started),
    timeoutMs: hardTimeoutMs, ...extra
  });
  async function exchange(method, suffix = "", data) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), networkTimeoutMs);
    try {
      const response = await fetchImpl(URL + suffix, {
        method, headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal, ...(data ? { body: JSON.stringify(data) } : {})
      });
      const requestId = safeRequestId(response.headers?.get?.("x-request-id"));
      let value;
      try { value = await response.json(); }
      catch { throw failure("response_transport", { httpStatus: response.status, requestId }); }
      if (!response.ok) throw httpError(response.status, value?.error?.code, requestId);
      return { value, requestId, httpStatus: response.status };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw failure("response_transport");
    } finally { clearTimeout(timer); }
  }
  if (state?.status === "submitting" || state?.status === "unknown") {
    // An interrupted POST may already be billed. It is not safe to submit again.
    throw failure("submission_outcome_unknown");
  }
  if (state && ["expired", "cancelled", "completed"].includes(state.status)) throw failure("checkpoint_not_resumable");
  if (state?.status === "failed" && (!state.retryable || state.attempts >= maxAttempts)) throw failure(state.code || "attempt_limit");

  let result;
  if (!state || state.status === "failed") {
    const attempt = (state?.attempts || 0) + 1;
    await persist({ fingerprint, claimId: randomUUID(), status: "submitting", attempts: attempt,
      startedAt: new Date(nowMs()).toISOString(), responseId: null });
    log("generation_stage_started", { attempt, model: body.model, softTimeoutMs, hardTimeoutMs });
    try { result = await exchange("POST", "", payload); }
    catch (error) {
      // 429 explicitly rejects the submission; transport/5xx leave its outcome uncertain.
      const status = error.metadata?.httpStatus;
      const rejected = Number.isInteger(status) && status >= 400 && status < 500 && status !== 408;
      await persist({ ...state, status: rejected ? "failed" : "unknown", retryable: rejected && error.retryable,
        code: error.errorCode, httpStatus: error.metadata?.httpStatus || null });
      throw failure(rejected ? error.errorCode : "submission_outcome_unknown");
    }
    if (!validId(result.value?.id)) {
      await persist({ ...state, status: "unknown", code: "missing_response_id" });
      throw failure("submission_outcome_unknown");
    }
    await persist({ ...state, responseId: result.value.id, status: "in_progress" });
    log("generation_response_saved", { responseId: state.responseId, attempt });
  } else if (!validId(state.responseId)) { throw failure("invalid_checkpoint"); }

  for (;;) {
    const age = nowMs() - Date.parse(state.startedAt);
    if (!warned && age >= softTimeoutMs) {
      warned = true;
      log("generation_slow", { responseId: state.responseId, elapsedMs: age, continuingSameRequest: true });
    }
    if (!result) {
      try { result = await exchange("GET", `/${state.responseId}`); }
      catch (error) {
        if (error.metadata?.httpStatus === 404) {
          await persist({ ...state, status: "expired", code: "response_expired" });
          throw failure("response_expired");
        }
        if (error.errorCode === "authentication" || error.errorCode === "billing") throw error;
        if (nowMs() - started >= hardTimeoutMs) throw failure("polling_unavailable");
        log("generation_poll_retry", { responseId: state.responseId, code: error.errorCode });
        await sleep(pollMs);
        continue;
      }
    }
    const { value, requestId, httpStatus } = result;
    if (value.id !== state.responseId) throw failure("response_id_mismatch");
    if (value.status === "completed") {
      let output;
      try {
        const text = outputText(value, requestId);
        if (text === null) throw new Error("No output");
        output = JSON.parse(text);
        validate(output);
      } catch {
        await persist({ ...state, status: "failed", retryable: false, code: "malformed_output" });
        throw failure("malformed_output");
      }
      const metadata = { ...responseMetadata(value, requestId), stage, targetDate,
        model: body.model, reasoningEffort: body.reasoning.effort,
        attempts: state.attempts, httpStatus, durationMs: Math.max(0, nowMs() - Date.parse(state.startedAt)),
        attemptDurationMs: Math.max(0, nowMs() - Date.parse(state.startedAt)),
        softTimeoutMs, timeoutMs: hardTimeoutMs, background: true, promptVersion };
      log("generation_stage_complete", metadata);
      return { output, metadata, request: { ...state, status: "completed" } };
    }
    if (!["queued", "in_progress"].includes(value.status)) {
      const retryable = value.status === "failed" && ["server_error", "rate_limit_exceeded"].includes(value.error?.code);
      await persist({ ...state, status: "failed", retryable, code: "provider_terminal_failure" });
      throw failure("provider_terminal_failure");
    }
    if (age >= hardTimeoutMs || nowMs() - started >= hardTimeoutMs) {
      try {
        const cancelled = await exchange("POST", `/${state.responseId}/cancel`, {});
        // Completion can race our cancellation. Preserve a finished result.
        if (cancelled.value?.status === "completed") { result = cancelled; continue; }
        if (cancelled.value?.status === "cancelled") {
          await persist({ ...state, status: "cancelled", code: "overall_deadline" });
        }
      } catch { /* Preserve the response ID if cancellation cannot be confirmed. */ }
      throw failure("overall_deadline");
    }
    result = null;
    await sleep(pollMs);
  }
}

export async function backgroundResponse(options) {
  try { return await runBackgroundResponse(options); }
  catch (error) {
    if (error instanceof GenerationError) {
      options.logger?.error?.(JSON.stringify({ event: "generation_failed", ...generationFailureDetails(error) }));
    }
    throw error;
  }
}
