import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const spec = await readFile(new URL("../.do/app.yaml", import.meta.url), "utf8");

test("DigitalOcean deploys only the static public directory", () => {
  assert.match(spec, /static_sites:/);
  assert.match(spec, /source_dir: public/);
  assert.match(spec, /deploy_on_push: true/);
  assert.doesNotMatch(spec, /^functions:/m);
  assert.doesNotMatch(spec, /current-edition|DATABASE_URL/);
});
