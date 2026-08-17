import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const august14 = JSON.parse(
  await readFile(new URL("../public/data/2026-08-14.json", import.meta.url), "utf8")
);

test("the static site reads current, index, and flat dated archives", () => {
  assert.match(app, /"\/data\/current\.json"/);
  assert.match(app, /"\/data\/index\.json"/);
  assert.match(app, /`\/data\/\$\{selectedDate\}\.json`/);
  assert.match(app, /\?date=\$\{date\}/);
  assert.match(html, /id="archive-toggle"/);
  assert.match(html, /id="archive-label">Today/);
  assert.match(html, /class="archive-today-hint">Current edition/);
  assert.match(styles, /#archive-today[^{]*\{[\s\S]*background: var\(--accent\)/);
  assert.match(html, /id="archive-calendar" role="grid"/);
  assert.match(app, /publishedDates\.has\(date\)/);
  assert.match(app, /day\.disabled = true/);
  assert.match(app, /event\.key === "Escape"/);
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
  const publicSource = `${html}\n${styles}\n${app}`;
  assert.doesNotMatch(publicSource, /\?mock|current-edition\/quiet-news|DATABASE_URL|OPENAI_API_KEY/);
  assert.doesNotMatch(publicSource, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(publicSource, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});

test("the informational disclaimer is split into three deliberate lines", () => {
  assert.match(html, /<span>For education and information only\.<\/span>/);
  assert.match(html, /<span>Not an official source\.<\/span>/);
  assert.match(html, /<span>Verify important details with the original sources\.<\/span>/);
  assert.match(styles, /\.disclaimer span \{ display: block; \}/);
  assert.match(styles, /\.disclaimer \{ max-width: none; margin: 12px 0 0; text-align: left; \}/);
});

test("the static shell loads extracted CSS and a deferred module", () => {
  assert.match(html, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<style>/);
  assert.doesNotMatch(html, /\b(?:async|defer)\b/);
});

test("the August 14 archive is an intentional zero-story edition", () => {
  assert.equal(august14.edition_date, "2026-08-14");
  assert.deepEqual(august14.stories, []);
});
