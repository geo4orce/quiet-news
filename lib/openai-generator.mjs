import { assertCandidateSet, CANDIDATE_SET_OUTPUT_SCHEMA } from "./candidate-set.mjs";
import {
  GENERATION_MODEL,
  discoveryInput,
  siftInput
} from "./generation-prompts.mjs";
import {
  assertSiftResult,
  countRejections,
  editionFromSiftResult,
  SIFT_OUTPUT_SCHEMA
} from "./sift-result.mjs";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_RETRY_DELAYS_MS = [1_000];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const MAX_PROVIDER_ATTEMPTS_PER_RUN = 4;

export class GenerationError extends Error {
  constructor(errorCode, retryable, metadata = {}) {
    super(errorCode);
    this.name = "GenerationError";
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.metadata = metadata;
  }
}

function countWebSearchCalls(response) {
  return Array.isArray(response.output)
    ? response.output.filter((item) => item?.type === "web_search_call").length
    : 0;
}

function responseMetadata(response, requestId = null) {
  return {
    responseId: typeof response?.id === "string" ? response.id : null,
    requestId,
    inputTokens: Number.isInteger(response?.usage?.input_tokens) ? response.usage.input_tokens : null,
    outputTokens: Number.isInteger(response?.usage?.output_tokens) ? response.usage.output_tokens : null,
    webSearchCalls: countWebSearchCalls(response || {})
  };
}

function outputText(response, requestId) {
  if (!Array.isArray(response.output)) return null;
  for (const item of response.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "refusal") {
        throw new GenerationError("provider_refusal", false, responseMetadata(response, requestId));
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function httpError(status, providerCode, requestId) {
  const metadata = { requestId };
  if (status === 408) return new GenerationError("timeout", true, metadata);
  if (status === 429 && providerCode !== "insufficient_quota") {
    return new GenerationError("rate_limit", true, metadata);
  }
  if (status >= 500) return new GenerationError("provider_5xx", true, metadata);
  if (status === 401 || status === 403) {
    return new GenerationError("authentication", false, metadata);
  }
  if (status === 429) return new GenerationError("billing", false, metadata);
  return new GenerationError("provider_request", false, metadata);
}

async function errorCodeFrom(response) {
  try {
    const value = await response.json();
    return typeof value?.error?.code === "string" ? value.error.code : null;
  } catch {
    return null;
  }
}

function requestBody({ model, reasoningEffort, maxOutputTokens, prompt, input, schema, schemaName, webSearch }) {
  return {
    model,
    store: false,
    reasoning: { effort: reasoningEffort },
    max_output_tokens: maxOutputTokens,
    ...(webSearch ? { tools: [{ type: "web_search" }] } : {}),
    input: [
      { role: "system", content: prompt },
      { role: "user", content: input }
    ],
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        strict: true,
        schema
      }
    }
  };
}

function total(values) {
  return values.every(Number.isInteger) ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function createOpenAIGenerator({
  apiKey,
  prompts,
  fetchImpl = globalThis.fetch,
  timeoutMs = 180_000,
  model = GENERATION_MODEL,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = wait,
  logger = console,
  nowMs = () => Date.now()
}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (typeof prompts?.discovery !== "string" || prompts.discovery.trim().length === 0
    || typeof prompts?.discoveryVersion !== "string" || prompts.discoveryVersion.trim().length === 0
    || typeof prompts?.sift !== "string" || prompts.sift.trim().length === 0
    || typeof prompts?.siftVersion !== "string" || prompts.siftVersion.trim().length === 0) {
    throw new Error("Quiet News generation prompts are not configured");
  }
  if (typeof fetchImpl !== "function") throw new TypeError("fetch must be a function");
  if (!Array.isArray(retryDelaysMs)) throw new TypeError("retry delays must be an array");
  if (retryDelaysMs.length > 1) throw new RangeError("each stage allows at most one retry");
  if (retryDelaysMs.some((delay) => !Number.isFinite(delay) || delay < 0)) {
    throw new TypeError("retry delays must be non-negative numbers");
  }

  async function callResponse(body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchImpl(RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new GenerationError("timeout", true);
      throw new GenerationError("network_error", false);
    } finally {
      clearTimeout(timer);
    }

    const requestId = response.headers?.get?.("x-request-id") || null;
    if (!response.ok) {
      throw httpError(response.status, await errorCodeFrom(response), requestId);
    }
    let value;
    try {
      value = await response.json();
    } catch {
      throw new GenerationError("malformed_output", false, { requestId });
    }
    const metadata = responseMetadata(value, requestId);
    if (value.status !== "completed") {
      throw new GenerationError("incomplete_output", false, metadata);
    }
    try {
      const text = outputText(value, requestId);
      if (text === null) throw new Error("missing output text");
      return { output: JSON.parse(text), metadata };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError("malformed_output", false, metadata);
    }
  }

  async function runStage({ stage, promptVersion, body, validate, describe }) {
    const startedAt = nowMs();
    for (let attempt = 1; ; attempt += 1) {
      try {
        const result = await callResponse(body);
        try {
          validate(result.output);
        } catch {
          throw new GenerationError("malformed_output", false, result.metadata);
        }
        const metadata = {
          stage,
          model,
          promptVersion,
          ...result.metadata,
          attempts: attempt,
          durationMs: Math.max(0, nowMs() - startedAt),
          ...describe(result.output)
        };
        logger.info?.(JSON.stringify({ event: "generation_stage_complete", ...metadata }));
        return { output: result.output, metadata };
      } catch (error) {
        if (!(error instanceof GenerationError)) throw error;
        if (error.retryable && attempt <= retryDelaysMs.length) {
          logger.warn?.(JSON.stringify({
            event: "generation_retry",
            stage,
            attempt,
            code: error.errorCode
          }));
          await sleep(retryDelaysMs[attempt - 1]);
          continue;
        }
        error.metadata = {
          ...error.metadata,
          stage,
          attempts: attempt,
          durationMs: Math.max(0, nowMs() - startedAt)
        };
        throw error;
      }
    }
  }

  return async function generate({ editionDay, priorEdition }) {
    const pipelineStartedAt = nowMs();
    const discovery = await runStage({
      stage: "discovery",
      promptVersion: prompts.discoveryVersion,
      body: requestBody({
        model,
        reasoningEffort: "medium",
        maxOutputTokens: 20_000,
        prompt: prompts.discovery,
        input: discoveryInput(editionDay, priorEdition),
        schema: CANDIDATE_SET_OUTPUT_SCHEMA,
        schemaName: "quiet_news_candidates",
        webSearch: true
      }),
      validate: (value) => assertCandidateSet(value, { targetDay: editionDay }),
      describe: (value) => ({ candidateCount: value.candidates.length })
    });

    let sift;
    try {
      sift = await runStage({
        stage: "sift",
        promptVersion: prompts.siftVersion,
        body: requestBody({
          model,
          reasoningEffort: "high",
          maxOutputTokens: 20_000,
          prompt: prompts.sift,
          input: siftInput(editionDay, priorEdition, discovery.output),
          schema: SIFT_OUTPUT_SCHEMA,
          schemaName: "quiet_news_sift",
          webSearch: false
        }),
        validate: (value) => assertSiftResult(value, discovery.output),
        describe: (value) => ({
          acceptedCount: value.stories.length,
          rejectedCount: value.rejections.length,
          rejectionCounts: countRejections(value)
        })
      });
    } catch (error) {
      if (error instanceof GenerationError) {
        error.metadata.totalProviderAttempts = discovery.metadata.attempts
          + (error.metadata.attempts || 0);
      }
      throw error;
    }

    const pipeline = {
      totalProviderAttempts: discovery.metadata.attempts + sift.metadata.attempts,
      inputTokens: total([discovery.metadata.inputTokens, sift.metadata.inputTokens]),
      outputTokens: total([discovery.metadata.outputTokens, sift.metadata.outputTokens]),
      webSearchCalls: total([discovery.metadata.webSearchCalls, sift.metadata.webSearchCalls]),
      durationMs: Math.max(0, nowMs() - pipelineStartedAt)
    };

    return {
      edition: editionFromSiftResult(sift.output, discovery.output),
      metadata: { discovery: discovery.metadata, sift: sift.metadata, pipeline }
    };
  };
}
