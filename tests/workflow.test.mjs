import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const directory = new URL("../.github/workflows/", import.meta.url);
const workflow = await readFile(
  new URL("check.yml", directory),
  "utf8"
);

test("GitHub Actions only checks repository changes", async () => {
  assert.deepEqual(await readdir(directory), ["check.yml"]);
  assert.match(workflow, /push:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /npm run check/);
  assert.doesNotMatch(workflow, /schedule:|workflow_dispatch:|OPENAI_API_KEY|contents: write/);
});
