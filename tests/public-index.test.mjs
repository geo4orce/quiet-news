import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSnapshot } from "../scripts/snapshot.mjs";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");

test("the deployed site is a single self-contained HTML file", () => {
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["']/i);
  assert.equal(html.match(/\bfetch\s*\(/g)?.length, 1);
});

test("the replacement endpoint stays dormant until its verified URL is set", () => {
  assert.match(html, /<meta name="quiet-news-api" content="">/);
  assert.match(html, /if \(endpoint\)\s*{\s*loadCurrentEdition\(endpoint\)/);
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
  assert.ok(html.indexOf("if (mockCount !== null)") < html.indexOf("if (endpoint)"));
});

test("the Function response is validated before rendering", () => {
  assert.match(html, /payload\.stories\.length <= 5/);
  assert.match(html, /isHttpsUrl\(source\.url\)/);
  assert.match(html, /if \(!validResponse\(value\)\) throw/);
  assert.match(html, /response\.status === 204/);
  assert.match(html, /News is temporarily unavailable\./);
});

test("the public artifact contains no server-side secret or credential", () => {
  assert.doesNotMatch(html, /OPENAI_API_KEY|DATABASE_URL/);
  assert.doesNotMatch(html, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(html, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});
