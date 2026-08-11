import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const configuration = await readFile(
  new URL("../functions/project.yml", import.meta.url),
  "utf8"
);
const bundleConfiguration = await readFile(
  new URL(
    "../functions/packages/quiet-news/current-edition/rollup.config.mjs",
    import.meta.url
  ),
  "utf8"
);
const includeConfiguration = await readFile(
  new URL(
    "../functions/packages/quiet-news/current-edition/.include",
    import.meta.url
  ),
  "utf8"
);
const runtimeEntry = await readFile(
  new URL(
    "../functions/packages/quiet-news/current-edition/runtime.mjs",
    import.meta.url
  ),
  "utf8"
);

test("the public Function uses Node.js 24", () => {
  assert.equal(configuration.match(/runtime: nodejs:24/g)?.length, 1);
  assert.doesNotMatch(configuration, /runtime: nodejs:(?:14|18|22)/);
});

test("the database URL is available to the current-edition Function", () => {
  const packageEnvironment = configuration.indexOf(
    'DATABASE_URL: "${DATABASE_URL}"'
  );
  const currentEdition = configuration.indexOf("name: current-edition");

  assert.ok(packageEnvironment > -1 && packageEnvironment < currentEdition);
  assert.doesNotMatch(configuration, /OPENAI_API_KEY/);
});

test("only the read Function is present and exposed to the web", () => {
  assert.match(configuration, /name: current-edition/);
  assert.match(configuration, /web: true/);
  assert.match(configuration, /web-custom-options: true/);
  assert.doesNotMatch(configuration, /name: publisher/);
});

test("the deployment bundle exports main in the runtime-compatible CommonJS format", () => {
  assert.match(configuration, /main: dist\/index\.cjs/);
  assert.match(bundleConfiguration, /file: "dist\/index\.cjs"/);
  assert.match(bundleConfiguration, /format: "cjs"/);
  assert.match(bundleConfiguration, /input: "runtime\.mjs"/);
  assert.match(runtimeEntry, /export const main = handler/);
  assert.equal(includeConfiguration.trim(), "dist/index.cjs");
});

test("the removed publisher Function has no deployment marker", async () => {
  await assert.rejects(
    access(new URL(
      "../functions/packages/quiet-news/publisher/.include",
      import.meta.url
    )),
    { code: "ENOENT" }
  );
});

test("the deployable configuration contains no credential values", () => {
  assert.doesNotMatch(configuration, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(configuration, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});
