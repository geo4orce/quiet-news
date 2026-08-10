import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidSnapshot } from "./snapshot.mjs";

const TIMEZONE = "America/New_York";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const draftPath = resolve(repositoryRoot, "data/draft.json");
const snapshotPath = resolve(repositoryRoot, "data/snapshot.json");
const publicIndexPath = resolve(repositoryRoot, "public/index.html");
const force = process.argv.includes("--force");

function newYorkClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour)
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function embedSnapshot(html, snapshot) {
  const marker = '<script id="snapshot-data" type="application/json">';
  const start = html.indexOf(marker);
  const end = html.indexOf("</script>", start + marker.length);

  if (start === -1 || end === -1) {
    throw new Error("The public index is missing its snapshot data block.");
  }

  const json = JSON.stringify(snapshot)
    .replaceAll("&", "\\u0026")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e");

  return `${html.slice(0, start + marker.length)}\n${json}\n    ${html.slice(end)}`;
}

const draft = assertValidSnapshot(await readJson(draftPath), { kind: "draft" });
const current = await readJson(snapshotPath);
assertValidSnapshot(current);

if (!draft.ready) {
  console.log("Draft is not marked ready. Publication skipped.");
  process.exit(0);
}

if (current.state === "published" && current.edition_date === draft.edition_date) {
  console.log(`Edition ${draft.edition_date} is already published.`);
  process.exit(0);
}

const clock = newYorkClock();
if (!force && (clock.hour !== 6 || clock.date !== draft.edition_date)) {
  console.log(
    `Publication skipped. New York time is ${clock.date} hour ${clock.hour}, ` +
      `and the draft is for ${draft.edition_date}.`
  );
  process.exit(0);
}

const published = {
  schema_version: 1,
  state: "published",
  edition_date: draft.edition_date,
  published_at: new Date().toISOString(),
  timezone: TIMEZONE,
  empty_message: draft.empty_message,
  stories: draft.stories
};

assertValidSnapshot(published);

const temporaryPath = `${snapshotPath}.tmp`;
const publicHtml = await readFile(publicIndexPath, "utf8");
const updatedPublicHtml = embedSnapshot(publicHtml, published);
const temporaryPublicPath = `${publicIndexPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(published, null, 2)}\n`, "utf8");
await writeFile(temporaryPublicPath, updatedPublicHtml, "utf8");
await rename(temporaryPath, snapshotPath);
await rename(temporaryPublicPath, publicIndexPath);

const consumedDraft = { ...draft, ready: false };
const temporaryDraftPath = `${draftPath}.tmp`;
await writeFile(temporaryDraftPath, `${JSON.stringify(consumedDraft, null, 2)}\n`, "utf8");
await rename(temporaryDraftPath, draftPath);

console.log(`Published ${published.edition_date} with ${published.stories.length} stories.`);
