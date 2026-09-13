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
import { publisherFailureRecord } from "../jobs/publisher.mjs";

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
  assert.equal(sift.body.text.format.schema.properties.stories.maxItems, 20);
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
  assert.equal(logs.filter((line) => JSON.parse(line).event === "generation_stage_complete").length, 2);
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

test("discovery and sift deadlines leave room within the twenty-minute job", { timeout: 1_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [stage, deadlineMs] of [["discovery", 300_000], ["sift", 180_000]]) {
    let signal;
    let started;
    const requestStarted = new Promise((resolve) => { started = resolve; });
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
      retryDelaysMs: [], logger: { info() {} },
      fetchImpl: async (_url, options) => {
        const isDiscovery = JSON.parse(options.body).text.format.name === "quiet_news_candidates";
        if (stage === "sift" && isDiscovery) {
          return response({ body: completedResponse(candidates()) });
        }
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
          started();
        });
      }
    });
    const failed = assert.rejects(
      generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => error.errorCode === "timeout" && error.metadata.stage === stage
    );
    await requestStarted;
    t.mock.timers.tick(deadlineMs - 1);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(signal.aborted, true);
    await failed;
  }
});

test("body timeouts retry only the unfinished stage and stop after two attempts", { timeout: 1_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const [stage, status] of [["discovery", 200], ["sift", 200], ["discovery", 503]]) {
    let calls = 0;
    const archivedStages = [];
    const logs = [];
    let notifyBody;
    const nextBody = () => new Promise((resolve) => { notifyBody = resolve; });
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret", prompts: TEST_PROMPTS, timeoutMs: 20,
      retryDelaysMs: [0], sleep: async () => {},
      logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line) },
      onGenerationStage: async (record) => { archivedStages.push(record.stage); },
      fetchImpl: async (_url, options) => {
        calls += 1;
        if (stage === "sift" && calls === 1) {
          return response({ body: completedResponse(candidates()) });
        }
        return {
          ...response({ status, requestId: "req_stalled_body" }),
          json: () => new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
            notifyBody();
          })
        };
      }
    });
    let bodyStarted = nextBody();
    const failed = assert.rejects(
      generate({ editionDay: "2026-08-11", priorEdition: null }),
      (error) => error.errorCode === "timeout"
        && error.metadata.stage === stage
        && error.metadata.attempts === 2
        && error.metadata.requestId === "req_stalled_body"
    );
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await bodyStarted;
      bodyStarted = nextBody();
      t.mock.timers.tick(20);
    }
    await failed;
    assert.equal(calls, stage === "sift" ? 3 : 2);
    assert.deepEqual(archivedStages, stage === "sift" ? ["discovery"] : []);
    assert.doesNotMatch(logs.join("\n"), /test-key-not-secret|Test discovery system prompt/);
  }
});

test("a malformed response body fails without retry and clears the deadline", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let signal;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret", prompts: TEST_PROMPTS, timeoutMs: 20,
    logger: { info() {}, warn() {} },
    fetchImpl: async (_url, options) => {
      calls += 1;
      signal = options.signal;
      return {
        ...response({}),
        json: async () => { throw new SyntaxError("secret provider response body"); }
      };
    }
  });
  await assert.rejects(generate({ editionDay: "2026-08-11", priorEdition: null }), (error) => {
    assert.equal(error.errorCode, "malformed_output");
    assert.equal(error.retryable, false);
    assert.doesNotMatch(JSON.stringify(error), /secret provider/);
    return true;
  });
  t.mock.timers.tick(20);
  assert.equal(signal.aborted, false);
  assert.equal(calls, 1);
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

test("archives only validated outputs in stage order without leaking or sharing mutable data", async () => {
  const records = [];
  const logs = [];
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
    logger: { info: (line) => logs.push(line) },
    onGenerationStage: async (record) => {
      records.push(structuredClone(record));
      if (record.stage === "discovery") record.output.candidates.length = 0;
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      if (calls === 2) {
        assert.equal(records[0].stage, "discovery");
        assert.equal(JSON.parse(JSON.parse(options.body).input[1].content).candidate_set.candidates.length, 2);
      }
      return response({ body: completedResponse(calls === 1 ? candidates() : siftResult()) });
    }
  });
  const result = await generate({ editionDay: "2026-08-11", priorEdition: { stories: [] } });
  assert.deepEqual(records.map((record) => record.stage), ["discovery", "sift"]);
  assert.deepEqual(records[0].output, candidates());
  assert.deepEqual(records[1].output, siftResult());
  assert.equal(records[0].target_date, "2026-08-11");
  assert.deepEqual(records[0].prior_stories, []);
  assert.doesNotMatch(JSON.stringify(result) + logs.join("\n"), /Neutral summary|candidate-02/);
  assert.doesNotMatch(JSON.stringify(records), /Test discovery system prompt|test-key-not-secret/);
});

test("archive failures are sanitized and never retry a paid stage", async () => {
  for (const failedStage of ["discovery", "sift"]) {
    let calls = 0;
    const failureLogs = [];
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
      logger: { info() {}, error: (line) => failureLogs.push(line) },
      onGenerationStage: async (record) => {
        if (record.stage === failedStage) throw new Error("secret archive response body");
      },
      fetchImpl: async () => {
        calls += 1;
        return response({ body: completedResponse(calls === 1 ? candidates() : siftResult()) });
      }
    });
    await assert.rejects(() => generate({ editionDay: "2026-08-11", priorEdition: null }), (error) => {
      assert.equal(error.errorCode, "archive_write_failed");
      assert.equal(error.metadata.stage, failedStage);
      assert.doesNotMatch(JSON.stringify(error) + error.message, /secret archive/);
      return true;
    });
    assert.equal(calls, failedStage === "discovery" ? 1 : 2);
    const failure = JSON.parse(failureLogs[0]);
    assert.equal(failure.code, "archive_write_failed");
    assert.equal(failure.targetDate, "2026-08-11");
    assert.equal(failure.providerAttempts, calls);
    assert.doesNotMatch(failureLogs.join("\n"), /secret archive/);
  }
});

test("logs enough context to diagnose both failed provider attempts without exposing bodies", async () => {
  const logs = [];
  let elapsedMs = 0;
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
    nowMs: () => elapsedMs,
    sleep: async (delay) => { elapsedMs += delay; },
    logger: { info: (line) => logs.push(line), warn: (line) => logs.push(line), error: (line) => logs.push(line) },
    fetchImpl: async () => {
      calls += 1;
      elapsedMs += calls === 1 ? 1_500 : 2_300;
      return response({
        status: 503, requestId: `req_attempt_${calls}`,
        body: { error: { code: "unavailable", message: "secret provider response" } }
      });
    }
  });
  await assert.rejects(generate({ editionDay: "2026-08-11", priorEdition: null }), (error) => {
    const record = publisherFailureRecord(error);
    assert.equal(record.httpStatus, 503);
    assert.equal(record.requestId, "req_attempt_2");
    assert.equal(record.targetDate, "2026-08-11");
    return true;
  });
  const records = logs.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.event), [
    "generation_stage_started", "generation_retry", "generation_stage_started", "generation_failed"
  ]);
  const retry = records[1];
  assert.equal(retry.requestId, "req_attempt_1");
  assert.equal(retry.httpStatus, 503);
  assert.equal(retry.attemptDurationMs, 1_500);
  assert.equal(retry.retryDelayMs, 1_000);
  assert.equal(retry.timeoutMs, 300_000);
  const failure = records.at(-1);
  assert.equal(failure.attemptDurationMs, 2_300);
  assert.equal(failure.durationMs, 4_800);
  assert.equal(failure.attempts, 2);
  assert.equal(failure.maxAttempts, 2);
  assert.equal(failure.providerAttempts, 2);
  assert.equal(failure.timeoutSource, null);
  assert.equal(failure.publicationStatus, "not_written");
  assert.match(logs.at(-1), /Publication for 2026-08-11 failed during discovery after 2 attempts/);
  assert.match(logs.at(-1), /HTTP 503.*No new publication was saved/);
  assert.doesNotMatch(logs.join("\n"), /secret provider|test-key-not-secret|Test discovery system prompt/);
});

test("distinguishes a client deadline from provider timeout responses", { timeout: 1_000 }, async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const status of [null, 408, 504]) {
    const logs = [];
    let notifyRequest;
    const requestStarted = new Promise((resolve) => { notifyRequest = resolve; });
    const generate = createOpenAIGenerator({
      apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
      timeoutMs: 20, retryDelaysMs: [],
      logger: { info() {}, error: (line) => logs.push(line) },
      fetchImpl: async (_url, options) => {
        if (status) return response({ status, body: { error: {} } });
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
          notifyRequest();
        });
      }
    });
    const rejected = assert.rejects(generate({ editionDay: "2026-08-11", priorEdition: null }));
    if (!status) {
      await requestStarted;
      t.mock.timers.tick(20);
    }
    await rejected;
    const failure = JSON.parse(logs[0]);
    assert.equal(failure.timeoutSource, status ? "provider_response" : "client_deadline");
    assert.equal(failure.httpStatus, status);
    assert.equal(failure.requestId, status ? "req_test" : null);
    assert.equal(failure.code, status === 504 ? "provider_5xx" : "timeout");
    assert.match(logs[1], status ? /provider returned a timeout response/ : /Our request deadline expired/);
  }
});

test("manual recovery reuses validated discovery only with matching date, configuration and context", async () => {
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret", prompts: TEST_PROMPTS, logger: { info() {} },
    fetchImpl: async (_url, options) => {
      calls += 1;
      assert.equal(JSON.parse(options.body).text.format.name, "quiet_news_sift");
      return response({ body: completedResponse(siftResult()) });
    }
  });
  const saved = { output: candidates(), priorStories: [],
    metadata: { model: "gpt-5.6-sol", promptVersion: TEST_PROMPTS.discoveryVersion } };
  const input = { editionDay: "2026-08-11", priorEdition: { stories: [] }, resumeDiscovery: saved };
  const result = await generate(input);
  assert.equal(calls, 1);
  assert.equal(result.metadata.pipeline.totalProviderAttempts, 1);
  assert.equal(result.metadata.discovery.reused, true);
  for (const changed of [
    { ...saved, priorStories: [{ headline: "different context" }] },
    { ...saved, metadata: { ...saved.metadata, model: "different-model" } },
    { ...saved, output: { ...saved.output, target_date: "2026-08-10" } }
  ]) await assert.rejects(generate({ ...input, resumeDiscovery: changed }));
  assert.equal(calls, 1);
});

test("failed sift logs count earlier discovery calls and do not repeat discovery", async () => {
  const logs = [];
  let calls = 0;
  const generate = createOpenAIGenerator({
    apiKey: "test-key-not-secret", prompts: TEST_PROMPTS,
    sleep: async () => {},
    logger: { info() {}, warn: (line) => logs.push(line), error: (line) => logs.push(line) },
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response({ body: completedResponse(candidates()) })
        : response({ status: 502, body: { error: {} } });
    }
  });
  await assert.rejects(generate({ editionDay: "2026-08-11", priorEdition: null }));
  assert.equal(calls, 3);
  const [retry, failure] = logs.slice(0, 2).map((line) => JSON.parse(line));
  assert.equal(retry.providerAttempts, 2);
  assert.equal(failure.providerAttempts, 3);
  assert.equal(failure.attempts, 2);
  assert.equal(failure.stage, "sift");
});
