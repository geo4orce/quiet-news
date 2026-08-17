import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/publish-daily.yml", import.meta.url),
  "utf8"
);

test("the primary and retry schedules use New York local time", () => {
  assert.match(workflow, /cron: "7 4 \* \* \*"\s+timezone: "America\/New_York"/);
  assert.match(workflow, /cron: "37 4 \* \* \*"\s+timezone: "America\/New_York"/);
  assert.match(workflow, /workflow_dispatch:/);
});

test("the workflow serializes Node 24 publication and grants scoped write access", () => {
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /uses: actions\/checkout@v5/);
  assert.match(workflow, /uses: actions\/setup-node@v5/);
  assert.match(workflow, /node-version: 24/);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/);
  assert.match(workflow, /git add public\/data/);
  assert.match(workflow, /git push origin HEAD:main/);
});
