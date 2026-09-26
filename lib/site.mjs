import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { assertPublication, assertPublicationIndex } from "./publication.mjs";
import { newYorkDay } from "./new-york-day.mjs";
import { datePath } from "../public/date-route.js";
import { illustrationFor } from "../public/illustrations.js";
import { storyImageId, validImageManifest } from "../public/image-manifest.js";
import { escapeHtml, replaceOne, fillSlot, editTag, setAttribute, toggleClass, showState } from "./site-template.mjs";

const origin = "https://quietnews.ai";

const displayDate = (date) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", month: "long", day: "numeric", year: "numeric"
}).format(new Date(`${date}T12:00:00Z`));

function metadata(template, { title, description, url, noindex }) {
  let html = replaceOne(template, /<title\b[^>]*>[\s\S]*?<\/title>/gi, (tag) =>
    tag.replace(/>[\s\S]*<\//, () => `>${escapeHtml(title)}</`));
  for (const [attribute, key, value] of [
    ["name", "description", description], ["property", "og:description", description],
    ["name", "twitter:description", description], ["property", "og:title", title],
    ["name", "twitter:title", title], ["property", "og:url", url]
  ]) {
    html = editTag(html, attribute, key, (tag) => setAttribute(tag, "content", value));
  }
  html = editTag(html, "rel", "canonical", (tag) => setAttribute(tag, "href", url));
  if (noindex) html = editTag(html, "name", "robots", (tag) => setAttribute(tag, "content", "noindex,follow"));
  return html;
}

function sourcesHtml(sources) {
  const seen = new Set();
  const groups = new Map();
  for (const source of sources) {
    if (seen.has(source.url)) continue;
    seen.add(source.url);
    const name = source.name.trim();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(source);
  }
  return [...groups].map(([name, group]) => `<span class="source-group">${escapeHtml(name)}${group.map((source, index) =>
    ` <a href="${escapeHtml(source.url)}" aria-label="${escapeHtml(`${name}, article ${index + 1} of ${group.length}`)}">[${index + 1}]</a>`).join("")}</span>`).join("");
}

export function renderStories(template, publication, images = []) {
  editTag(template, "id", "story-template", (tag) => tag);
  const storyTemplate = template.match(/<template\b(?=[^>]*\sid\s*=\s*["']story-template["'])[^>]*>([\s\S]*?)<\/template>/i)?.[1];
  if (!storyTemplate) throw new Error("Story template is missing");
  // Validate the complete contract even when the publication has no stories/images.
  for (const name of ["story-headline", "story-body", "story-sources", "story-image"]) fillSlot(storyTemplate, name, "");
  for (const name of ["data-story", "data-story-headline", "data-story-details", "data-story-body", "data-story-sources"]) {
    editTag(storyTemplate, name, null, (tag) => tag);
  }
  return publication.stories.map((story, index) => {
    let html = fillSlot(storyTemplate, "story-headline", escapeHtml(story.headline));
    html = fillSlot(html, "story-body", escapeHtml(story.body));
    html = fillSlot(html, "story-sources", sourcesHtml(story.sources));
    const image = images[index];
    html = fillSlot(html, "story-image", image
      ? `<figure class="story-illustration"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="1536" height="1024" loading="lazy" fetchpriority="low" decoding="async"></figure>` : "");
    html = editTag(html, "data-story-details", null, (tag) => toggleClass(tag, "has-illustration", Boolean(image)));
    return html;
  }).join("\n");
}

export function renderSavedPage(template, publication, images = [], { noindex = false } = {}) {
  const date = publication.edition_date;
  const day = displayDate(date);
  let html = metadata(template, {
    title: `Quiet News | ${day}`,
    description: publication.stories.length ? `Quiet News for ${day}. ${publication.stories.length} ${publication.stories.length === 1 ? "story" : "stories"} worth your attention, with sources.` : `Quiet News for ${day}. Quiet.`,
    url: `${origin}${datePath(date)}`, noindex
  });
  html = replaceOne(html, /<html\b[^>]*>/gi, (tag) => setAttribute(tag, "data-saved-date", date));
  html = editTag(html, "type", "module", (tag) => setAttribute(tag, "fetchpriority", "low"));
  html = editTag(html, "id", "news", (tag) => setAttribute(tag, "aria-live", null));
  html = fillSlot(html, "saved-stories", renderStories(template, publication, images));
  html = showState(html, publication.stories.length ? "stories" : "archive-quiet");
  html = fillSlot(html, "saved-day-heading", `<h1 class="saved-date"><time datetime="${date}">${day}</time></h1>`);
  return html;
}

export function renderMissingPage(template, { noindex = true } = {}) {
  let html = metadata(template, { title: "Unavailable | Quiet News", description: "This saved day is unavailable.", url: `${origin}/`, noindex });
  html = editTag(html, "rel", "canonical", () => "");
  return showState(html, "unavailable");
}

async function imagesFor(directory, publication) {
  let manifest;
  try {
    const value = JSON.parse(await readFile(path.join(directory, "images", publication.edition_date, "index.json"), "utf8"));
    if (validImageManifest(value, publication.edition_date)) manifest = value;
  } catch { /* Images are optional. */ }
  return Promise.all(publication.stories.map(async (story) => {
    const image = manifest?.images[await storyImageId(story)] ?? illustrationFor(publication.edition_date, story.headline);
    if (!image) return null;
    try { return (await stat(path.join(directory, image.src))).isFile() ? image : null; }
    catch { return null; }
  }));
}

// Purely local reads. Publication JSON is the source of truth; no provider calls.
export async function generatePages(directory, { now = new Date(), noindex = false } = {}) {
  const template = await readFile(path.join(directory, "index.html"), "utf8");
  const readJson = async (name) => JSON.parse(await readFile(path.join(directory, "data", name), "utf8"));
  const index = assertPublicationIndex(await readJson("index.json"));
  assert.ok(index.dates.length, "Archive index is empty");
  const datedFiles = (await readdir(path.join(directory, "data"))).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).map((name) => name.slice(0, 10)).sort().reverse();
  assert.deepEqual(index.dates, datedFiles, "Archive index does not match dated files");
  const publications = [];
  for (const date of index.dates) {
    const publication = assertPublication(await readJson(`${date}.json`));
    assert.equal(publication.edition_date, date, "Publication date mismatch");
    assert.ok(date < newYorkDay(now), "Unfinished dates cannot be published");
    publications.push(publication);
  }
  const current = assertPublication(await readJson("current.json"));
  assert.deepEqual(current, publications[0], "Current publication differs from latest saved day");
  const pages = new Map();
  for (const publication of publications) {
    pages.set(`${publication.edition_date}/index.html`, renderSavedPage(template, publication,
      await imagesFor(directory, publication), { noindex }));
  }
  let homepage = template;
  if (noindex) homepage = editTag(homepage, "name", "robots", (tag) => setAttribute(tag, "content", "noindex,follow"));
  pages.set("index.html", homepage);
  pages.set("404.html", renderMissingPage(template));
  // Omit lastmod until a durable correction timestamp exists. Rebuild time is not content modification time.
  pages.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...index.dates.map(datePath)].map((route) => `  <url><loc>${origin}${route}</loc></url>`).join("\n")}\n</urlset>\n`);
  if (noindex) pages.set("robots.txt", "User-agent: *\nDisallow: /\n");
  return pages;
}
