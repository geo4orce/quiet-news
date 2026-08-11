import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const configuration = await readFile(
  new URL("../functions/project.yml", import.meta.url),
  "utf8"
);

test("both Functions use Node.js 24", () => {
  assert.equal(configuration.match(/runtime: nodejs:24/g)?.length, 2);
  assert.doesNotMatch(configuration, /runtime: nodejs:(?:14|18|22)/);
});

test("the database URL is shared while the OpenAI key is publisher-only", () => {
  const packageEnvironment = configuration.indexOf(
    'DATABASE_URL: "${DATABASE_URL}"'
  );
  const currentEdition = configuration.indexOf("name: current-edition");
  const publisher = configuration.indexOf("name: publisher");
  const openAIKey = configuration.indexOf(
    'OPENAI_API_KEY: "${OPENAI_API_KEY}"'
  );

  assert.ok(packageEnvironment > -1 && packageEnvironment < currentEdition);
  assert.ok(openAIKey > publisher);
  assert.equal(configuration.indexOf("OPENAI_API_KEY", 0), openAIKey);
});

test("only the read Function is exposed to the web", () => {
  const currentBlock = configuration.match(
    /- name: current-edition[\s\S]*?(?=\n\s+- name: publisher)/
  )?.[0];
  const publisherBlock = configuration.match(/- name: publisher[\s\S]*/)?.[0];

  assert.match(currentBlock, /web: true/);
  assert.match(currentBlock, /web-custom-options: true/);
  assert.match(publisherBlock, /web: false/);
  assert.doesNotMatch(publisherBlock, /web: true/);
});

test("the deployable configuration contains no credential values", () => {
  assert.doesNotMatch(configuration, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(configuration, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});
