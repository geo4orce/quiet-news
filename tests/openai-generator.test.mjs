import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAIGenerator,
  GenerationError
} from "../lib/openai-generator.mjs";

function response({ status = 200, body, requestId = "req_test" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "x-request-id" ? requestId : null },
    json: async () => body
  };
}

function completedResponse(edition = { stories: [] }) {
  return {
    id: "resp_test",
    status: "completed",
    usage: { input_tokens: 20, output_tokens: 10 },
    output: [
      { type: "web_search_call", id: "search_1" },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(edition) }]
      }
    ]
  };
}

test("sends a non-stored web-search request with a strict edition schema", async () => {
  let request;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response({ body: completedResponse() });
    }
  });

  const result = await generate({ editionDay: "2026-08-11", priorEdition: null });
  const body = JSON.parse(request.options.body);

  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.store, false);
  assert.deepEqual(body.tools, [{ type: "web_search" }]);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.match(body.input[1].content, /"edition_day":"2026-08-11"/);
  const sourceSchema = body.text.format.schema.properties.stories.items
    .properties.sources.items;
  assert.deepEqual(sourceSchema.required, ["name", "url"]);
  assert.equal(sourceSchema.properties.url.pattern, "^https://");
  assert.equal("format" in sourceSchema.properties.url, false);
  assert.deepEqual(result.edition, { stories: [] });
  assert.deepEqual(result.metadata, {
    responseId: "resp_test",
    requestId: "req_test",
    inputTokens: 20,
    outputTokens: 10,
    webSearchCalls: 1
  });
});

test("classifies rate limits and provider 5xx responses as retryable", async () => {
  for (const [status, code, expected] of [
    [429, "rate_limit_exceeded", "rate_limit"],
    [503, null, "provider_5xx"]
  ]) {
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret",
      fetchImpl: async () => response({ status, body: { error: { code } } })
    });
    await assert.rejects(
      () => generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => {
        assert.ok(error instanceof GenerationError);
        assert.equal(error.errorCode, expected);
        assert.equal(error.retryable, true);
        return true;
      }
    );
  }
});

test("does not retry billing or authentication failures", async () => {
  for (const [status, code, expected] of [
    [429, "insufficient_quota", "billing"],
    [401, null, "authentication"]
  ]) {
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret",
      fetchImpl: async () => response({ status, body: { error: { code } } })
    });
    await assert.rejects(
      () => generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => error.errorCode === expected && error.retryable === false
    );
  }
});

test("treats timeout as retryable and other network errors as final", async () => {
  const timeoutGenerate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    timeoutMs: 1,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })
  });
  await assert.rejects(
    () => timeoutGenerate({ editionDay: "2026-08-11", priorEdition: null }),
    (error) => error.errorCode === "timeout" && error.retryable === true
  );

  const networkGenerate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    fetchImpl: async () => { throw new Error("socket failure"); }
  });
  await assert.rejects(
    () => networkGenerate({ editionDay: "2026-08-11", priorEdition: null }),
    (error) => error.errorCode === "network_error" && error.retryable === false
  );
});

test("rejects malformed, invalid, incomplete, and refused output without retry", async () => {
  const bodies = [
    completedResponse({ stories: [], unknown: true }),
    { ...completedResponse(), status: "incomplete" },
    {
      ...completedResponse(),
      output: [{ type: "message", content: [{ type: "refusal", refusal: "No" }] }]
    }
  ];

  for (const body of bodies) {
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret",
      fetchImpl: async () => response({ body })
    });
    await assert.rejects(
      () => generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => error instanceof GenerationError && error.retryable === false
    );
  }
});
