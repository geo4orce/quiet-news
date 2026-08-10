import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSnapshot } from "../scripts/snapshot.mjs";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("the deployed site is a single self-contained HTML file", () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
});

test("the embedded snapshot is valid", () => {
  const match = html.match(
    /<script id="snapshot-data" type="application\/json">\s*([\s\S]*?)\s*<\/script>/
  );
  assert.ok(match, "snapshot data block is present");
  assert.deepEqual(validateSnapshot(JSON.parse(match[1])), []);
});

test("mock mode accepts only zero through five", () => {
  assert.match(html, /\^\[0-5\]\$/);
  assert.match(html, /mocks\.slice\(0, mockCount\)/);
});
