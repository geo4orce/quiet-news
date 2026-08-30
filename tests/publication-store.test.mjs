import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ArchiveExistsError, PublicationStore } from "../lib/publication-store.mjs";

const makePublication = (date, publishedAt) => ({
  edition_date: date,
  published_at: publishedAt,
  expires_at: new Date(Date.parse(publishedAt) + 172_800_000).toISOString(),
  stories: []
});

test("publishes an archive, exact current copy, and newest-first index", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "quiet-news-store-"));
  const store = new PublicationStore(directory);
  const first = makePublication("2026-08-14", "2026-08-15T08:07:00.000Z");
  const second = makePublication("2026-08-15", "2026-08-16T08:07:00.000Z");

  await store.publish(first);
  await store.publish(second);

  assert.deepEqual(await store.readEdition("2026-08-14"), first);
  assert.deepEqual(await store.readCurrent(), second);
  assert.deepEqual((await store.readIndex()).dates, ["2026-08-15", "2026-08-14"]);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(directory, "current.json"), "utf8")),
    JSON.parse(await readFile(path.join(directory, "2026-08-15.json"), "utf8"))
  );
});

test("refuses to replace an existing dated archive", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "quiet-news-store-"));
  const store = new PublicationStore(directory);
  const value = makePublication("2026-08-15", "2026-08-16T08:07:00.000Z");
  await store.publish(value);
  await assert.rejects(() => store.publish(value), ArchiveExistsError);
});
