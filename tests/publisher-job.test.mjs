import test from "node:test";
import assert from "node:assert/strict";
import { publisherFailureRecord, runPublisherJob } from "../jobs/publisher.mjs";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";

test("missing configuration fails with sanitized output", () => {
  assert.throws(
    () => createOpenAIGenerator({ apiKey: "" }),
    (error) => {
      const output = JSON.stringify(publisherFailureRecord(error));
      assert.match(output, /"event":"publisher_failed"/);
      assert.doesNotMatch(output, /OPENAI_API_KEY|sk-/);
      return true;
    }
  );

  assert.throws(
    () => createOpenAIGenerator({ apiKey: "test-key-not-secret", prompts: {} }),
    (error) => {
      const output = JSON.stringify(publisherFailureRecord(error));
      assert.match(output, /"event":"publisher_failed"/);
      assert.doesNotMatch(output, /QUIET_NEWS_.*PROMPT|Test discovery|Test sift/);
      return true;
    }
  );
});

test("already published jobs skip private archive preparation and prompt loading", async () => {
  const result = await runPublisherJob({
    env: {}, logger: { info() {} },
    store: { hasEdition: async () => true },
    prepareGeneration: async () => { throw new Error("must not prepare"); },
    onGenerationStage: async () => { throw new Error("must not archive"); }
  });
  assert.equal(result.status, "already_published");
});

test("archive preflight failure stops before generator configuration or publication", async () => {
  await assert.rejects(() => runPublisherJob({
    env: {}, logger: { info() {} },
    store: {
      hasEdition: async () => false, readEdition: async () => null,
      publish: async () => { assert.fail("must not publish"); }
    },
    prepareGeneration: async () => { throw new Error("preflight unavailable"); }
  }), /preflight unavailable/);
});
