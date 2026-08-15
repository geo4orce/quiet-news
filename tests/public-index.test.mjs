import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("the static site reads current, index, and flat dated archives", () => {
  assert.match(app, /"\/data\/current\.json"/);
  assert.match(app, /"\/data\/index\.json"/);
  assert.match(app, /`\/data\/\$\{selectedDate\}\.json`/);
  assert.match(app, /\?date=\$\{date\}/);
  assert.match(html, /Browse the archive/);
});

test("current content expires explicitly while selected archives remain readable", () => {
  assert.match(app, /Date\.parse\(value\.expires_at\) <= Date\.now\(\)/);
  assert.match(app, /!isArchive &&/);
  assert.match(app, /Today's edition could not be published\. Please come back later\./);
});

test("the browser validates publications and tolerates a missing archive index", () => {
  assert.match(app, /value\.stories\.length <= 5/);
  assert.match(app, /httpsUrl\(source\.url\)/);
  assert.match(app, /hasOnly\(value, PUBLICATION_FIELDS\)/);
  assert.match(app, /Archive navigation is optional/);
});

test("there is no mock, Function, database, or secret path in public artifacts", () => {
  const publicSource = `${html}\n${app}`;
  assert.doesNotMatch(publicSource, /\?mock|current-edition\/quiet-news|DATABASE_URL|OPENAI_API_KEY/);
  assert.doesNotMatch(publicSource, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(publicSource, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});
