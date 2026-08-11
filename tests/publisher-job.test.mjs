import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageConfiguration = JSON.parse(await readFile(
  new URL("../package.json", import.meta.url),
  "utf8"
));
const jobSource = await readFile(
  new URL("../jobs/publisher.mjs", import.meta.url),
  "utf8"
);

test("the scheduled publisher uses the Node.js 24 app runtime", () => {
  assert.equal(packageConfiguration.engines.node, "24.x");
  assert.equal(packageConfiguration.scripts["job:publisher"], "node jobs/publisher.mjs");
});

test("the publisher job closes its database pool and never contains credentials", () => {
  assert.match(jobSource, /await pool\.end\(\)/);
  assert.match(jobSource, /DATABASE_URL/);
  assert.match(jobSource, /OPENAI_API_KEY/);
  assert.doesNotMatch(jobSource, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(jobSource, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});

test("startup failures are sanitized and exit unsuccessfully", () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("../jobs/publisher.mjs", import.meta.url))],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: "", OPENAI_API_KEY: "" }
    }
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /"error_code":"startup_error"/);
  assert.doesNotMatch(result.stderr, /DATABASE_URL|OPENAI_API_KEY/);
});
