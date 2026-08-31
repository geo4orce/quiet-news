import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyDateRequest,
  formatArchiveToggleLabel,
  publicationState,
  selectedDateFrom
} from "../public/app.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const logo = await readFile(new URL("../public/quiet-news.svg", import.meta.url), "utf8");
const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");
const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
test("the static site loads current and past days", () => {
  assert.match(app, /"\/data\/current\.json"/);
  assert.match(app, /"\/data\/index\.json"/);
  assert.match(app, /`\/data\/\$\{selectedDate\}\.json`/);
  assert.match(app, /\?date=\$\{date\}/);
  assert.match(html, /id="archive-toggle"/);
  assert.match(html, /id="archive-calendar" role="grid"/);
  assert.match(html, />Jump to date</);
  assert.match(html, /quiet-news\.svg/);
  assert.match(logo, /#147d76/);
  assert.equal(new Set([...logo.matchAll(/#[\da-f]{6}/gi)].map(([color]) => color)).size, 1);
  assert.match(logo, /width="42" height="42" viewBox="0 0 42 42"/);
  assert.match(logo, /shape-rendering="geometricPrecision"/);
  assert.match(logo, /stroke-linecap="round"/);
  assert.match(logo, /stroke-linejoin="round"/);
  assert.match(logo, /stroke-width="6"/);
  assert.match(html, /class="story-toggle"/);
  assert.match(html, /data-story-details hidden/);
  assert.match(html, /data-story-sources/);
  assert.match(html, /Today is quiet\. Come back tomorrow\./);
  assert.doesNotMatch(html, />GitHub<\/a>/);
  assert.match(app, /publishedDates\.has\(date\)/);
  assert.match(app, /link\.href = source\.url/);
  assert.match(app, /"Sources:"/);
  assert.match(styles, /\.sources a \{ display: block;/);
  assert.match(styles, /white-space: pre-line/);
  assert.doesNotMatch(`${styles}\n${app}`, /is-open/);
  assert.match(app, /toggleAll\.textContent = "Open all"/);
  assert.match(app, /setStoryOpen/);
});

test("the loading indicator remains accessible", () => {
  assert.match(html, /id="news-loading"[\s\S]*Loading Quiet News\./);
  assert.match(html, /class="loading-dots" aria-hidden="true"/);
  assert.match(styles, /prefers-reduced-motion: reduce[\s\S]*\.loading-dots span \{ animation: none;/);
});

test("the requested-day state matrix is explicit and honest", () => {
  const today = "2026-08-28";
  const dates = ["2026-08-26", "2026-08-25", "2026-08-24", "2026-08-21", "2026-08-14", "2026-08-13"];
  const matrix = [
    ["current with stories", null, 3, false, "stories"],
    ["current with zero stories", null, 0, false, "current-quiet"],
    ["current load failure", null, 0, true, "error"],
    ["saved day with stories", "2026-08-26", 2, false, "stories"],
    ["saved day with zero stories", "2026-08-14", 0, false, "archive-quiet"],
    ["saved day load failure", "2026-08-25", 0, true, "error"],
    ["day before the archive", "2026-08-12", 0, false, "unavailable"],
    ["gap inside the archive", "2026-08-22", 0, false, "unavailable"],
    ["missed completed day", "2026-08-27", 0, false, "unavailable"],
    ["current unfinished day", "2026-08-28", 0, false, "not-yet"],
    ["far future day", "2027-01-01", 0, false, "not-yet"],
    ["malformed date falls back to current", "not-a-date", 1, false, "stories"]
  ];

  const resolved = matrix.map(([name, requestedDate, storyCount, failed]) => {
    const selectedDate = selectedDateFrom(requestedDate);
    const requestState = classifyDateRequest(selectedDate, dates, today);
    const state = requestState === "current" || requestState === "saved"
      ? publicationState(selectedDate, storyCount, failed)
      : requestState;
    return [name, state];
  });
  assert.deepEqual(resolved, matrix.map(([name, , , , expected]) => [name, expected]));

  const newsStateIds = new Set([...html.matchAll(/id="([^"]+)"[^>]*data-news-state/g)].map((match) => match[1]));
  new Set(matrix.map(([, , , , expected]) => expected))
    .forEach((expected) => assert.ok(newsStateIds.has(expected), `missing ${expected} state`));

  assert.match(html, /id="current-quiet"[^>]*>Today is quiet\. Come back tomorrow\.<\/p>/);
  assert.match(html, /id="archive-quiet"[^>]*>Quiet\.<\/p>/);
  assert.match(html, /id="unavailable"[^>]*>Unavailable\.<\/p>/);
  assert.match(html, /id="not-yet"[^>]*>Not yet\.<\/p>/);
  assert.match(html, /id="error"[^>]*>Error\.<\/p>/);
  assert.match(app, /history\.replaceState/);
  assert.match(app, /code: "invalid_date_parameter"/);
  assert.match(app, /code: "archive_date_unavailable"/);
  assert.match(app, /code: selectedDate === null \? "current_load_failed" : "archive_load_failed"/);
  assert.doesNotMatch(app, /console\.(?:warn|error)\([^;]*requestedDate/);
  assert.match(html, /id="archive-calendar"[\s\S]*<a id="archive-today" class="hidden" href="\/">Today<\/a>/);
  assert.doesNotMatch(html, />Latest<\/a>/);
});

test("archive controls reflect the day being viewed", () => {
  assert.equal(formatArchiveToggleLabel(null), "Jump to date");
  assert.equal(formatArchiveToggleLabel("2026-08-14"), "Aug-14");
  assert.equal(formatArchiveToggleLabel("2026-08-04"), "Aug-4");
  assert.match(app, /toggle\.textContent = formatArchiveToggleLabel\(selectedDate\)/);
  assert.match(app, /todayLink\.classList\.toggle\("hidden", selectedDate === null\)/);
});

test("the browser rejects stale or malformed publications", () => {
  assert.match(app, /Date\.parse\(value\.expires_at\) <= Date\.now\(\)/);
  assert.match(app, /!isArchive &&/);
  assert.match(app, /value\.stories\.length <= 5/);
  assert.match(app, /httpsUrl\(source\.url\)/);
});

test("there is no mock, Function, database, or secret path in public artifacts", () => {
  const publicSource = `${html}\n${styles}\n${app}`;
  assert.doesNotMatch(publicSource, /\?mock|current-edition\/quiet-news|DATABASE_URL|OPENAI_API_KEY/);
  assert.doesNotMatch(publicSource, /sk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(publicSource, /postgres(?:ql)?:\/\/[^\s"']+@/i);
});

test("the sitemap exposes only the canonical homepage", () => {
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1];
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  assert.equal(canonical, "https://quiet-news.com/");
  assert.deepEqual(locations, [canonical]);
  assert.doesNotMatch(sitemap, /<lastmod>|\?date=|\/data\//);
  assert.equal(
    robots.replaceAll("\r\n", "\n").trimEnd(),
    "User-agent: *\nAllow: /\n\nSitemap: https://quiet-news.com/sitemap.xml"
  );
});
