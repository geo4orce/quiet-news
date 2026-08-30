import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { assertPublication, assertPublicationIndex } from "../lib/publication.mjs";

const directory = fileURLToPath(new URL("../public/data/", import.meta.url));
const readJson = async (name) => JSON.parse(await readFile(path.join(directory, name), "utf8"));

const index = assertPublicationIndex(await readJson("index.json"));
assert.ok(index.dates.length > 0, "index must contain at least one edition");

const publications = new Map();
for (const date of index.dates) {
  const publication = assertPublication(await readJson(`${date}.json`));
  assert.equal(publication.edition_date, date, `${date}.json has the wrong edition_date`);
  publications.set(date, publication);
}

const current = assertPublication(await readJson("current.json"));
assert.deepEqual(
  current,
  publications.get(current.edition_date),
  "current.json must exactly match its dated archive"
);
assert.equal(current.edition_date, index.dates[0], "current edition must be first in index.json");

const datedFiles = (await readdir(directory))
  .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))
  .map((name) => name.slice(0, 10))
  .sort()
  .reverse();
assert.deepEqual(datedFiles, index.dates, "index.json must list every dated archive exactly once");

console.log(`Validated ${index.dates.length} publication files`);
