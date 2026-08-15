import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageConfiguration = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const jobSource = await readFile(new URL("../jobs/publisher.mjs", import.meta.url), "utf8");

test("the publisher uses Node.js 24 and only the OpenAI secret", () => {
  assert.equal(packageConfiguration.engines.node, "24.x");
  assert.equal(packageConfiguration.scripts["job:publisher"], "node jobs/publisher.mjs");
  assert.match(jobSource, /OPENAI_API_KEY/);
  assert.doesNotMatch(jobSource, /DATABASE_URL|postgres|sk-[A-Za-z0-9_-]{20,}/i);
});

test("missing configuration fails with sanitized output", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../jobs/publisher.mjs", import.meta.url))],
    { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } }
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /"event":"publisher_failed"/);
  assert.doesNotMatch(result.stderr, /OPENAI_API_KEY|sk-/);
});
