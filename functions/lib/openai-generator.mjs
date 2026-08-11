import { assertEdition, EDITION_OUTPUT_SCHEMA } from "./edition.mjs";
import {
  EDITORIAL_MODEL,
  EDITORIAL_PROMPT,
  editorialInput
} from "./editorial-prompt.mjs";

const RESPONSES_URL = "https://api.openai.com/v1/responses";

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

function outputText(response, requestId) {
  if (!Array.isArray(response.output)) return null;

  for (const item of response.output) {
    if (item?.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content?.type === "refusal") {
        throw new GenerationError(
          "provider_refusal",
          false,
          responseMetadata(response, requestId)
        );
      }
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function responseMetadata(response, requestId = null) {
  return {
    responseId: typeof response?.id === "string" ? response.id : null,
    requestId,
    inputTokens: Number.isInteger(response?.usage?.input_tokens)
      ? response.usage.input_tokens
      : null,
    outputTokens: Number.isInteger(response?.usage?.output_tokens)
      ? response.usage.output_tokens
      : null,
    webSearchCalls: countWebSearchCalls(response || {})
  };
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

export function createOpenAIGenerator({
  apiKey,
  fetchImpl = globalThis.fetch,
  timeoutMs = 90_000,
  model = EDITORIAL_MODEL
}) {
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch must be a function");

  return async function generate({ attemptDay, priorEdition }) {
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
        body: JSON.stringify({
          model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 2_000,
          tools: [{ type: "web_search" }],
          input: [
            { role: "system", content: EDITORIAL_PROMPT },
            { role: "user", content: editorialInput(attemptDay, priorEdition) }
          ],
          text: {
            format: {
              type: "json_schema",
              name: "quiet_news_edition",
              strict: true,
              schema: EDITION_OUTPUT_SCHEMA
            }
          }
        })
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

    let edition;
    try {
      const text = outputText(value, requestId);
      if (text === null) throw new Error("missing output text");
      edition = JSON.parse(text);
      assertEdition(edition);
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      throw new GenerationError("malformed_output", false, metadata);
    }

    return { edition, metadata };
  };
}
