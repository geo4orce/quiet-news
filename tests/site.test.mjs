import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { generatePages } from "../lib/site.mjs";
import { buildSite } from "../scripts/build-site.mjs";
import { createSiteServer } from "../scripts/serve.mjs";
import { dateFromPath, legacyDateRedirect } from "../public/date-route.js";
import { storyImageId } from "../public/image-manifest.js";

const template = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const dates = ["2026-09-12", "2026-09-11", "2026-09-10"];
const now = new Date("2026-09-26T12:00:00Z");
const story = { headline: 'A <script>alert("x")</script> & headline', body: 'Saved text.\n\n<img src=x onerror="alert(1)">',
  sources: [{ name: "Source & one", url: "https://example.com/?a=1&b=2" }] };

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "qn-site-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, "public");
  await mkdir(path.join(directory, "data"), { recursive: true });
  const write = async (name, value) => {
    const target = path.join(directory, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof value === "string" ? value : JSON.stringify(value));
  };
  await write("index.html", template);
  await write("styles.css", "body { color: blue; }");
  await write("data/index.json", { updated_at: "2026-09-13T08:00:00.000Z", dates });
  const publications = dates.map((date, index) => ({ edition_date: date,
    published_at: "2026-09-13T08:00:00.000Z", expires_at: "2026-09-14T09:00:00.000Z",
    stories: index === 1 ? [] : [story] }));
  for (const publication of publications) await write(`data/${publication.edition_date}.json`, publication);
  await write("data/current.json", publications[0]);
  return { root, directory, write, publications };
}

test("saved HTML contains escaped full stories, source links and its own metadata after expiry", async (t) => {
  const { directory } = await fixture(t);
  const pages = await generatePages(directory, { now });
  const html = pages.get(`${dates[0]}/index.html`);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Saved text\.\n\n&lt;img/);
  assert.doesNotMatch(html, /<script>alert|<img src=x/);
  assert.match(html, /href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/quietnews.ai\/2026-09-12\/">/);
  assert.match(html, /property="og:url" content="https:\/\/quietnews.ai\/2026-09-12\/"/);
  assert.match(html, /<title>Quiet News \| September 12, 2026<\/title>/);
  assert.match(html, /id="stories" data-news-state>/);
  assert.match(html, /id="news-loading" class="empty hidden"/);
  assert.match(html, /id="archive" class="hidden"/);
  assert.match(html, /href="\/styles.css\?v=/);
  assert.doesNotMatch(pages.get("index.html"), /Saved text/);
});

test("quiet days remain readable, crawlable pages and sitemap keeps the whole archive", async (t) => {
  const { directory } = await fixture(t);
  const pages = await generatePages(directory, { now });
  assert.match(pages.get(`${dates[1]}/index.html`), /id="archive-quiet" class="empty" data-news-state>Quiet\./);
  assert.deepEqual([...pages.get("sitemap.xml").matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]),
    ["https://quietnews.ai/", ...dates.map((date) => `https://quietnews.ai/${date}/`)]);
  assert.doesNotMatch(pages.get("sitemap.xml"), /lastmod|quietnews.dev|\?date/);
  const dev = await generatePages(directory, { now, noindex: true });
  for (const [name, html] of dev) if (name.endsWith(".html")) assert.match(html, /content="noindex,follow"/);
  assert.match(dev.get("robots.txt"), /Disallow: \//);
});

test("only matching, available images enter saved HTML; absent or malformed images remain optional", async (t) => {
  const { directory, write } = await fixture(t);
  const id = await storyImageId(story);
  const image = { src: `/images/${dates[0]}/${id}.jpg`, alt: 'Drawing & "detail"', width: 1536, height: 1024 };
  await write(`images/${dates[0]}/index.json`, { version: 1, edition_date: dates[0], images: { [id]: image } });
  let pages = await generatePages(directory, { now });
  assert.doesNotMatch(pages.get(`${dates[0]}/index.html`), /<figure/);
  await write(image.src.slice(1), "test image bytes");
  pages = await generatePages(directory, { now });
  assert.match(pages.get(`${dates[0]}/index.html`), /<figure class="story-illustration">/);
  assert.match(pages.get(`${dates[0]}/index.html`), /alt="Drawing &amp; &quot;detail&quot;"/);
  await write(`images/${dates[0]}/index.json`, "invalid json");
  pages = await generatePages(directory, { now });
  assert.doesNotMatch(pages.get(`${dates[0]}/index.html`), /<figure/);
});

test("rebuilding updates all layouts and corrections without changing source data; failures preserve prior output", async (t) => {
  const { root, write, publications } = await fixture(t);
  const initial = await buildSite(root, { now });
  assert.equal(initial.dates, 3);
  await write("index.html", template.replace("<header>", '<header class="new-layout">'));
  await write("styles.css", "body { color: green; }");
  const corrected = { ...publications[0], stories: [{ ...story, body: "Corrected saved text." }] };
  await write(`data/${dates[0]}.json`, corrected);
  await write("data/current.json", corrected);
  await buildSite(root, { now });
  for (const date of dates) assert.match(await readFile(path.join(initial.directory, date, "index.html"), "utf8"), /class="new-layout"/);
  const saved = await readFile(path.join(initial.directory, dates[0], "index.html"), "utf8");
  assert.match(saved, /Corrected saved text/);
  assert.equal(await readFile(path.join(initial.directory, "styles.css"), "utf8"), "body { color: green; }");
  await write(`data/${dates[0]}.json`, { ...corrected, secret: "unexpected" });
  await assert.rejects(buildSite(root, { now }));
  assert.equal(await readFile(path.join(initial.directory, dates[0], "index.html"), "utf8"), saved);
});

test("future publications and incomplete archives fail generation", async (t) => {
  const { directory, write } = await fixture(t);
  await assert.rejects(generatePages(directory, { now: new Date("2026-09-12T12:00:00Z") }));
  await write("data/index.json", { updated_at: now.toISOString(), dates: dates.slice(1) });
  await assert.rejects(generatePages(directory, { now }));
});

test("shared template slots survive wrappers, extra classes, reordered attributes and single quotes", async (t) => {
  const { directory, write } = await fixture(t);
  const redesigned = template
    .replace('<html lang="en">', "<html class='updated-layout' lang='en'>")
    .replace('<meta name="robots" content="index,follow">', "<meta content='index,follow' data-note='keep' name='robots'>")
    .replace('<link rel="canonical" href="https://quietnews.ai/">', "<link href='https://quietnews.ai/' rel='canonical'>")
    .replace('<div id="stories" class="hidden" data-news-state>', "<div data-news-state class='reading hidden' id='stories'>")
    .replace('<template id="story-template">', "<template data-note='keep'\n id='story-template'>")
    .replace('<h2 data-story-headline>', '<h2 class="headline" data-story-headline>')
    .replace('<div class="story-details" data-story-details>', "<div data-story-details class='story-details redesigned'>")
    .replace('<p class="summary" data-story-body><!-- story-body --></p>', '<section class="body-wrapper"><p data-story-body class="summary"><!-- story-body --></p></section>');
  await write("index.html", redesigned);
  const pages = await generatePages(directory, { now, noindex: true });
  const html = pages.get(`${dates[0]}/index.html`);
  assert.match(html, /class='updated-layout' lang='en' data-saved-date="2026-09-12"/);
  assert.match(html, /content="noindex,follow" data-note='keep' name='robots'/);
  assert.match(html, /href="https:\/\/quietnews.ai\/2026-09-12\/" rel='canonical'/);
  assert.match(html, /data-news-state class="reading" id='stories'/);
  assert.match(html, /<section class="body-wrapper"><p data-story-body class="summary">Saved text/);
  assert.match(html, /<h2 class="headline" data-story-headline>A &lt;script/);
  assert.match(pages.get("index.html"), /content="noindex,follow"/);
});

test("missing or duplicate template slots fail safely even when every saved day is quiet", async (t) => {
  const { root, write, publications } = await fixture(t);
  for (const publication of publications) await write(`data/${publication.edition_date}.json`, { ...publication, stories: [] });
  await write("data/current.json", { ...publications[0], stories: [] });
  const { directory } = await buildSite(root, { now });
  const output = path.join(directory, dates[0], "index.html");
  const previous = await readFile(output, "utf8");
  for (const broken of [
    template.replace('<!-- story-image -->', ''),
    template.replace('<!-- saved-stories -->', '<!-- saved-stories --><!-- saved-stories -->'),
    template.replace('data-story-body', 'data-incorrect-body')
  ]) {
    await write("index.html", broken);
    await assert.rejects(buildSite(root, { now }), /template marker/);
    assert.equal(await readFile(output, "utf8"), previous);
  }
});

test("date routes reject invalid calendar days and old links preserve unrelated parameters", () => {
  assert.equal(dateFromPath("/2026-09-12/"), "2026-09-12");
  assert.equal(dateFromPath("/2026-09-12"), "2026-09-12");
  for (const route of ["/2026-02-30/", "/2026-99-12/", "/junk/", "/2026-09-12/extra"]) assert.equal(dateFromPath(route), null);
  assert.equal(legacyDateRedirect(new URL("https://example.com/?date=2026-09-12&utm_source=test#story")), "/2026-09-12/?utm_source=test#story");
  assert.equal(legacyDateRedirect(new URL("https://example.com/?date=2026-99-12")), null);
});

test("local HTTP serves clean dated HTML, redirects legacy links, and returns real missing responses", async (t) => {
  const { root } = await fixture(t);
  const { directory } = await buildSite(root, { now });
  const server = createSiteServer(directory);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route, options = {}) => fetch(`${base}${route}`, { redirect: "manual", ...options });
  const dated = await get(`/${dates[0]}/`);
  assert.equal(dated.status, 200);
  assert.match(await dated.text(), /Saved text/);
  for (const route of [`/?date=${dates[0]}`, `/${dates[0]}`, `/${dates[0]}/index.html`]) {
    const response = await get(route);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), `/${dates[0]}/`);
  }
  assert.equal(await (await get(`/${dates[0]}/`, { method: "HEAD" })).text(), "");
  for (const route of ["/2026-08-01/", "/2026-99-12/", "/nonsense/", "/data-raw/secret.json"]) {
    const response = await get(route);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /id="unavailable" class="empty"/);
  }
  const future = await get("/2999-01-01/");
  assert.equal(future.status, 404);
  assert.match(await future.text(), /id="not-yet" class="empty"/);
  assert.equal((await get("/", { method: "POST" })).status, 405);
});
