import test from "node:test";
import assert from "node:assert/strict";
import { publisherFailureRecord } from "../jobs/publisher.mjs";
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
