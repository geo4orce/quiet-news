import test from "node:test";
import assert from "node:assert/strict";
import { GenerationError } from "../functions/lib/openai-generator.mjs";
import { createPublisherHandler } from "../functions/lib/publisher.mjs";

function quietLog() {
  return { info() {} };
}

function fakeDatabase(overrides = {}) {
  let nextAttempt = 1;
  return {
    loadPriorEdition: async () => null,
    reserveAttempt: async () => nextAttempt++,
    failAttempt: async () => {},
    publishEdition: async () => ({ id: 99, created_at: new Date() }),
    ...overrides
  };
}

function handler(options = {}) {
  return createPublisherHandler({
    database: fakeDatabase(),
    generate: async () => ({
      edition: { stories: [] },
      metadata: {
        responseId: "resp_test",
        requestId: "req_test",
        inputTokens: 10,
        outputTokens: 5,
        webSearchCalls: 1
      }
    }),
    model: "test-model",
    promptVersion: "test-v1",
    now: () => new Date("2026-08-11T12:00:00Z"),
    log: quietLog(),
    ...options
  });
}

test("publishes a valid zero-story edition and stops after success", async () => {
  let generations = 0;
  const publish = handler({
    generate: async () => {
      generations += 1;
      return { edition: { stories: [] }, metadata: {} };
    }
  });
  const result = await publish();
  assert.deepEqual(result, {
    status: "published",
    attempts: 1,
    attempt_id: 1,
    edition_id: 99,
    story_count: 0
  });
  assert.equal(generations, 1);
});

test("retries transient failures at most three times with exponential jitter", async () => {
  const delays = [];
  const failed = [];
  let calls = 0;
  const database = fakeDatabase({
    failAttempt: async (id, code) => failed.push([id, code])
  });
  const publish = handler({
    database,
    generate: async () => {
      calls += 1;
      if (calls < 3) throw new GenerationError("rate_limit", true);
      return { edition: { stories: [] }, metadata: {} };
    },
    sleep: async (delay) => delays.push(delay),
    random: () => 0.5
  });

  const result = await publish();
  assert.equal(result.status, "published");
  assert.equal(result.attempts, 3);
  assert.deepEqual(delays, [300, 550]);
  assert.deepEqual(failed, [[1, "rate_limit"], [2, "rate_limit"]]);
});

test("does not retry a non-transient failure", async () => {
  let calls = 0;
  const publish = handler({
    generate: async () => {
      calls += 1;
      throw new GenerationError("authentication", false);
    }
  });
  const result = await publish();
  assert.deepEqual(result, { status: "failed", attempts: 1, error_code: "authentication" });
  assert.equal(calls, 1);
});

test("does not call the provider when the daily circuit breaker is open", async () => {
  let called = false;
  const publish = handler({
    database: fakeDatabase({ reserveAttempt: async () => null }),
    generate: async () => { called = true; }
  });
  const result = await publish();
  assert.deepEqual(result, { status: "daily_limit_reached", attempts: 0 });
  assert.equal(called, false);
});

test("stops after three transient provider failures", async () => {
  let reservations = 0;
  const publish = handler({
    database: fakeDatabase({
      reserveAttempt: async () => ++reservations,
      failAttempt: async () => {}
    }),
    generate: async () => { throw new GenerationError("provider_5xx", true); },
    sleep: async () => {}
  });
  const result = await publish();
  assert.deepEqual(result, { status: "failed", attempts: 3, error_code: "provider_5xx" });
  assert.equal(reservations, 3);
});

test("passes the newest prior edition as context", async () => {
  const prior = { stories: [{ headline: "Prior", body: "Prior body" }] };
  let received;
  const publish = handler({
    database: fakeDatabase({ loadPriorEdition: async () => prior }),
    generate: async (input) => {
      received = input;
      return { edition: { stories: [] }, metadata: {} };
    }
  });
  await publish();
  assert.deepEqual(received, { attemptDay: "2026-08-11", priorEdition: prior });
});

test("database and validation failures never trigger provider retries", async () => {
  const unavailable = handler({
    database: fakeDatabase({ loadPriorEdition: async () => { throw new Error("db"); } })
  });
  assert.deepEqual(await unavailable(), {
    status: "failed", attempts: 0, error_code: "database_error"
  });

  let calls = 0;
  const invalid = handler({
    generate: async () => {
      calls += 1;
      return { edition: { stories: [], extra: true }, metadata: {} };
    }
  });
  assert.deepEqual(await invalid(), {
    status: "failed", attempts: 1, error_code: "validation_error"
  });
  assert.equal(calls, 1);
});
