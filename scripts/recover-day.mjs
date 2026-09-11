import assert from "node:assert/strict";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";
import { GENERATION_MODEL } from "../lib/generation-prompts.mjs";
import { assertCandidateSet } from "../lib/candidate-set.mjs";
import { assertSiftResult, editionFromSiftResult } from "../lib/sift-result.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { createPublication } from "../lib/publication.mjs";
import { addCalendarDays, isCalendarDay, newYorkDay, publicationWindow } from "../lib/new-york-day.mjs";

export function recoveryWindow(date, now = new Date()) {
  if (!isCalendarDay(date) || date >= newYorkDay(now)) throw new Error("Recovery requires a completed day");
  const window = publicationWindow(now);
  return {
    ...window, editionDay: date,
    // Past backfills remain expired on the default page, but readable by date.
    expiresAt: date === window.editionDay ? window.expiresAt : new Date(now.getTime() + 1).toISOString()
  };
}

async function atomicJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(`${filename}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(`${filename}.tmp`, filename);
}

export async function recoverDay({ date, mode, privateDirectory, root, logger = console }) {
  recoveryWindow(date);
  if (!["generate", "publish"].includes(mode)) throw new Error("Choose generate or publish");
  const store = new PublicationStore(path.join(root, "public/data"));
  if (await store.hasEdition(date)) return { status: "already_published", date };
  const current = await store.readCurrent();
  if (date !== addCalendarDays(current.edition_date, 1)) throw new Error("Recover missing days in order");
  const prior = await store.readEdition(addCalendarDays(date, -1));
  const priorStories = prior.stories;
  const filename = path.join(root, "data-raw", `${date}.json`);
  let archive;
  try { archive = JSON.parse(await readFile(filename, "utf8")); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    archive = { schema_version: 1, target_date: date, runs: [] };
  }
  assert.equal(archive.schema_version, 1);
  assert.equal(archive.target_date, date);
  assert.ok(Array.isArray(archive.runs));
  let entry = archive.runs.at(-1);
  const { loadPrompts, assertPrivateStoryLimit } = await import(pathToFileURL(path.join(privateDirectory, "runner.mjs")));
  const prompts = await loadPrompts(privateDirectory);
  if (entry) {
    assert.deepEqual(entry.prior_stories, priorStories);
    assertCandidateSet(entry.discovery.output, { targetDay: date });
    assert.equal(entry.discovery.metadata.model, GENERATION_MODEL);
    assert.equal(entry.discovery.metadata.promptVersion, prompts.discoveryVersion);
  }
  if (mode === "generate" && !entry?.sift) {
    const generate = createOpenAIGenerator({
      apiKey: process.env.OPENAI_API_KEY, prompts, logger,
      onGenerationStage: async (record) => {
        if (record.stage === "discovery") {
          entry = { captured_at: new Date().toISOString(), prior_stories: priorStories,
            discovery: { output: record.output, metadata: record.metadata }, sift: null };
          archive.runs.push(entry);
        } else entry.sift = { output: record.output, metadata: record.metadata };
        await atomicJson(filename, archive);
        logger.info(JSON.stringify({ event: "recovery_checkpoint", targetDate: date, stage: record.stage }));
      }
    });
    await generate({ editionDay: date, priorEdition: { stories: priorStories },
      ...(entry ? { resumeDiscovery: { ...entry.discovery, priorStories } } : {}) });
  }
  if (!entry?.sift) throw new Error("No completed sift is available");
  assert.equal(entry.sift.metadata.model, GENERATION_MODEL);
  assert.equal(entry.sift.metadata.promptVersion, prompts.siftVersion);
  assertSiftResult(entry.sift.output, entry.discovery.output);
  const edition = assertPrivateStoryLimit(editionFromSiftResult(entry.sift.output, entry.discovery.output));
  if (mode === "publish") await store.publish(createPublication(recoveryWindow(date), edition));
  return { status: mode === "publish" ? "saved_locally" : "ready_for_review", date,
    candidates: entry.discovery.output.candidates.length, stories: edition.stories.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, date, privateDirectory] = process.argv.slice(2);
  recoverDay({ mode, date, privateDirectory,
    root: fileURLToPath(new URL("../", import.meta.url))
  }).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(JSON.stringify({ event: "recovery_failed", code: error.errorCode || "recovery_validation_or_io" }));
    process.exitCode = 1;
  });
}
