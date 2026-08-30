import test from "node:test";
import assert from "node:assert/strict";
import {
  createOpenAIGenerator,
  GenerationError,
  MAX_PROVIDER_ATTEMPTS_PER_RUN
} from "../lib/openai-generator.mjs";
import {
  MAX_SIFT_BODY_LENGTH,
  MAX_SIFT_HEADLINE_LENGTH
} from "../lib/sift-result.mjs";

const TEST_PROMPTS = {
  discovery: "Test discovery system prompt.",
  discoveryVersion: "test-discovery-v1",
  sift: "Test sift system prompt.",
  siftVersion: "test-sift-v1"
};

function response({ status = 200, body, requestId = "req_test" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "x-request-id" ? requestId : null },
    json: async () => body
  };
}

function completedResponse(value, { id = "resp_test", webSearch = false, inputTokens = 20, outputTokens = 10 } = {}) {
  return {
    id,
    status: "completed",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    output: [
      ...(webSearch ? [{ type: "web_search_call", id: "search_1" }] : []),
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(value) }]
      }
    ]
  };
}

function candidate(index) {
  return {
    candidate_id: `candidate-${String(index).padStart(2, "0")}`,
    event_date: "2026-08-11",
    title: `Candidate ${index}`,
    summary: `Neutral summary ${index}`,
    category: "world",
    geography: "Global",
    sources: [{ name: "Example", url: `https://example.com/${index}` }]
  };
}

function candidates(count = 2) {
  return {
    target_date: "2026-08-11",
    candidates: Array.from({ length: count }, (_, index) => candidate(index + 1))
  };
}

function siftResult() {
  return {
    stories: [{
      candidate_id: "candidate-01",
      headline: "Short factual title",
      body: "One plain sentence.",
      sources: [{ name: "Example", url: "https://example.com/1" }]
    }],
    rejections: [{ candidate_id: "candidate-02", code: "insufficient_materiality" }]
  };
}

test("runs independent discovery and sift requests with structured metadata", async () => {
  const requests = [];
  const logs = [];
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    prompts: TEST_PROMPTS,
    retryDelaysMs: [],
    logger: { info: (line) => logs.push(line), warn() {} },
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return requests.length === 1
        ? response({
          body: completedResponse(candidates(), {
            id: "resp_discovery",
            webSearch: true,
            inputTokens: 30,
            outputTokens: 20
          }),
          requestId: "req_discovery"
        })
        : response({
          body: completedResponse(siftResult(), {
            id: "resp_sift",
            inputTokens: 40,
            outputTokens: 10
          }),
          requestId: "req_sift"
        });
    }
  });

  const result = await generate({ editionDay: "2026-08-11", priorEdition: { stories: [] } });
  const [discovery, sift] = requests;

  assert.equal(requests.length, 2);
  assert.equal(discovery.url, "https://api.openai.com/v1/responses");
  assert.equal(discovery.body.model, "gpt-5.6-sol");
  assert.equal(discovery.body.input[0].content, TEST_PROMPTS.discovery);
  assert.equal(discovery.body.store, false);
  assert.deepEqual(discovery.body.reasoning, { effort: "medium" });
  assert.deepEqual(discovery.body.tools, [{ type: "web_search" }]);
  assert.equal(discovery.body.text.format.name, "quiet_news_candidates");
  assert.equal(discovery.body.text.format.strict, true);

  assert.equal(sift.body.store, false);
  assert.equal(sift.body.input[0].content, TEST_PROMPTS.sift);
  assert.deepEqual(sift.body.reasoning, { effort: "high" });
  assert.equal("tools" in sift.body, false);
  assert.equal("previous_response_id" in discovery.body, false);
  assert.equal("previous_response_id" in sift.body, false);
  assert.deepEqual(JSON.parse(sift.body.input[1].content).candidate_set, candidates());
  assert.equal(sift.body.text.format.name, "quiet_news_sift");
  assert.equal(
    sift.body.text.format.schema.properties.stories.items.properties.headline.maxLength,
    MAX_SIFT_HEADLINE_LENGTH
  );
  assert.equal(
    sift.body.text.format.schema.properties.stories.items.properties.body.maxLength,
    MAX_SIFT_BODY_LENGTH
  );

  assert.deepEqual(result.edition, {
    stories: [{
      headline: "Short factual title",
      body: "One plain sentence.",
      sources: [{ name: "Example", url: "https://example.com/1" }]
    }]
  });
  assert.equal(result.metadata.discovery.responseId, "resp_discovery");
  assert.equal(result.metadata.discovery.candidateCount, 2);
  assert.equal(result.metadata.sift.acceptedCount, 1);
  assert.equal(result.metadata.sift.promptVersion, TEST_PROMPTS.siftVersion);
  assert.equal(result.metadata.sift.rejectionCounts.insufficient_materiality, 1);
  assert.deepEqual(result.metadata.pipeline, {
    totalProviderAttempts: 2,
    inputTokens: 70,
    outputTokens: 30,
    webSearchCalls: 1,
    durationMs: result.metadata.pipeline.durationMs
  });
  assert.equal(logs.length, 2);
  assert.doesNotMatch(logs.join("\n"), /Neutral summary/);
});

test("rejects an oversized discovery set before calling the sift", async () => {
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    prompts: TEST_PROMPTS,
    retryDelaysMs: [],
    logger: { info() {}, warn() {} },
    fetchImpl: async () => {
      calls += 1;
      return response({ body: completedResponse(candidates(21), { webSearch: true }) });
    }
  });

  await assert.rejects(
    () => generate({ editionDay: "2026-08-11", priorEdition: null }),
    (error) => error instanceof GenerationError
      && error.errorCode === "malformed_output"
      && error.metadata.stage === "discovery"
  );
  assert.equal(calls, 1);
});

test("retries only the failed sift with the validated in-memory candidates", async () => {
  const bodies = [];
  const delays = [];
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    prompts: TEST_PROMPTS,
    retryDelaysMs: [25],
    sleep: async (delay) => delays.push(delay),
    logger: { info() {}, warn() {} },
    fetchImpl: async (_url, options) => {
      calls += 1;
      bodies.push(JSON.parse(options.body));
      if (calls === 1) return response({ body: completedResponse(candidates(), { webSearch: true }) });
      if (calls === 2) return response({ status: 503, body: { error: { code: "unavailable" } } });
      return response({ body: completedResponse(siftResult()) });
    }
  });

  const result = await generate({ editionDay: "2026-08-11", priorEdition: null });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25]);
  assert.deepEqual(bodies[1], bodies[2]);
  assert.equal(result.metadata.discovery.attempts, 1);
  assert.equal(result.metadata.sift.attempts, 2);
  assert.equal(result.metadata.pipeline.totalProviderAttempts, 3);
});

test("caps retryable failures at two attempts per stage", async () => {
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret",
    prompts: TEST_PROMPTS,
    retryDelaysMs: [0],
    sleep: async () => {},
    logger: { info() {}, warn() {} },
    fetchImpl: async () => {
      calls += 1;
      return response({ status: 429, body: { error: { code: "rate_limit_exceeded" } } });
    }
  });

  await assert.rejects(
    () => generate({ editionDay: "2026-08-11", priorEdition: null }),
    (error) => error instanceof GenerationError
      && error.errorCode === "rate_limit"
      && error.metadata.attempts === 2
  );
  assert.equal(calls, 2);
  assert.equal(MAX_PROVIDER_ATTEMPTS_PER_RUN, 4);
});

test("classifies permanent provider failures without retrying", async () => {
  for (const [status, code, expected] of [
    [429, "insufficient_quota", "billing"],
    [401, null, "authentication"]
  ]) {
    let calls = 0;
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret",
      prompts: TEST_PROMPTS,
      retryDelaysMs: [0],
      logger: { info() {}, warn() {} },
      fetchImpl: async () => {
        calls += 1;
        return response({ status, body: { error: { code } } });
      }
    });
    await assert.rejects(
      () => generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => error instanceof GenerationError
        && error.errorCode === expected
        && error.retryable === false
    );
    assert.equal(calls, 1);
  }
});
