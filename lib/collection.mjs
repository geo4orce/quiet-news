import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertCandidateSet, CANDIDATE_SET_OUTPUT_SCHEMA } from "./candidate-set.mjs";
import { addCalendarDays, isCalendarDay, newYorkDay, newYorkLocalTime } from "./new-york-day.mjs";

export const MAX_COLLECTION_CANDIDATES = 80;
export const COLLECTION_SLOTS = [6, 12, 18, 24];
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", hourCycle: "h23" });
const withdrawalCodes = ["duplicate_event", "corrected_or_withdrawn", "outside_target_day"];
export const COLLECTION_OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["target_date", "candidates", "withdrawals"],
  properties: {
    ...structuredClone(CANDIDATE_SET_OUTPUT_SCHEMA.properties),
    withdrawals: { type: "array", maxItems: MAX_COLLECTION_CANDIDATES, items: {
      type: "object", additionalProperties: false, required: ["candidate_id", "code", "replacement_id"],
      properties: {
        candidate_id: { type: "string" }, code: { type: "string", enum: withdrawalCodes },
        replacement_id: { type: ["string", "null"] }
      }
    } }
  }
};
const collected = COLLECTION_OUTPUT_SCHEMA.properties.candidates.items.properties;
for (const [field, maximum] of Object.entries({ title: 200, summary: 1600, category: 80, geography: 160 })) {
  collected[field].maxLength = maximum;
}
collected.sources.maxItems = 4;
collected.sources.items.properties.name.maxLength = 120;
collected.sources.items.properties.url.maxLength = 2048;

export function collectionWindow(now = new Date()) {
  const day = newYorkDay(now);
  const hour = Number(clock.format(now));
  if (hour < 3) throw new Error("Collection has no scheduled window before 03:00 New York");
  const slot = hour < 6 ? 24 : hour < 12 ? 6 : hour < 18 ? 12 : 18;
  return { targetDate: slot === 24 ? addCalendarDays(day, -1) : day, slot };
}

// Resolve midnight correctly on DST-change days as well as the daytime slots.
export function localBoundary(day, hour) {
  if (hour === 24) return localBoundary(addCalendarDays(day, 1), 0);
  if (hour === 0) {
    const noon = newYorkLocalTime(day, 12);
    for (let minutes = 12 * 60; minutes <= 14 * 60; minutes += 60) {
      const candidate = new Date(noon.getTime() - minutes * 60_000);
      if (newYorkDay(candidate) === day && Number(clock.format(candidate)) === 0) return candidate.toISOString();
    }
    // Spring-forward day has only eleven hours from midnight to noon.
    const candidate = new Date(noon.getTime() - 11 * 3_600_000);
    if (newYorkDay(candidate) === day && Number(clock.format(candidate)) === 0) return candidate.toISOString();
    throw new Error("Cannot resolve New York midnight");
  }
  return newYorkLocalTime(day, hour).toISOString();
}

export function mergeCollection(pool, output, targetDate) {
  if (!output || Object.keys(output).some((key) => !["target_date", "candidates", "withdrawals"].includes(key))) throw new Error("Invalid collection fields");
  assertCandidateSet({ target_date: output.target_date, candidates: output.candidates }, { targetDay: targetDate });
  for (const candidate of output.candidates) {
    if (candidate.title.length > 200 || candidate.summary.length > 1600 || candidate.category.length > 80
      || candidate.geography.length > 160 || candidate.sources.length > 4
      || candidate.sources.some((source) => source.name.length > 120 || source.url.length > 2048)) throw new Error("Collection candidate exceeds limits");
  }
  if (JSON.stringify(output).length > 120_000 || !Array.isArray(output.withdrawals) || output.withdrawals.length > MAX_COLLECTION_CANDIDATES) throw new Error("Invalid collection size");
  const result = new Map(pool.map((candidate) => [candidate.candidate_id, structuredClone(candidate)]));
  for (const candidate of output.candidates) result.set(candidate.candidate_id, structuredClone(candidate));
  const removed = new Set();
  for (const entry of output.withdrawals) {
    if (!entry || Object.keys(entry).sort().join() !== "candidate_id,code,replacement_id"
      || !withdrawalCodes.includes(entry.code) || !result.has(entry.candidate_id) || removed.has(entry.candidate_id)
      || output.candidates.some((candidate) => candidate.candidate_id === entry.candidate_id)) throw new Error("Invalid collection withdrawal");
    if (entry.code === "duplicate_event") {
      if (!entry.replacement_id || entry.replacement_id === entry.candidate_id || !result.has(entry.replacement_id)) throw new Error("Invalid duplicate replacement");
    } else if (entry.replacement_id !== null) throw new Error("Unexpected replacement");
    removed.add(entry.candidate_id);
  }
  if (output.withdrawals.some((entry) => entry.replacement_id && removed.has(entry.replacement_id))) throw new Error("Replacement was also removed");
  for (const id of removed) result.delete(id);
  const candidates = [...result.values()].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  assertCandidateSet({ target_date: targetDate, candidates }, { targetDay: targetDate, maxCandidates: MAX_COLLECTION_CANDIDATES });
  return candidates;
}

export function completedPool(archive) {
  let pool = [];
  let coveredThrough = 0;
  let previousSlot = 0;
  for (const batch of archive.collection?.batches || []) {
    if (!COLLECTION_SLOTS.includes(batch.slot) || batch.slot <= previousSlot) throw new Error("Invalid collection ordering");
    previousSlot = batch.slot;
    if (!batch.result) continue;
    if (batch.fromHour !== coveredThrough || batch.request?.status !== "completed") throw new Error("Invalid collection coverage");
    pool = mergeCollection(pool, batch.result.output, archive.target_date);
    coveredThrough = batch.slot;
  }
  return { pool, coveredThrough };
}

export function collectionReadiness(archive) {
  const { pool, coveredThrough } = completedPool(archive);
  const successfulBatches = (archive.collection?.batches || []).filter((batch) => batch.result).length;
  const complete = coveredThrough === 24;
  const coverage = {
    status: complete ? "complete" : "partial",
    successfulBatches,
    expectedBatches: COLLECTION_SLOTS.length,
    coveredThroughHour: coveredThrough,
    missingIntervals: complete ? [] : [{ fromHour: coveredThrough, toHour: 24 }]
  };
  return { pool, coverage, canPublish: complete || successfulBatches >= COLLECTION_SLOTS.length - 1 };
}

export const poolFingerprint = (pool) => createHash("sha256").update(JSON.stringify(pool)).digest("hex");

export class CollectionStore {
  constructor(checkout, persist = async () => {}) { this.checkout = checkout; this.persist = persist; }
  filename(day) {
    if (!isCalendarDay(day)) throw new Error("Invalid collection date");
    return path.join(this.checkout, "data-raw", `${day}.json`);
  }
  async read(day) {
    let archive;
    try { archive = JSON.parse(await readFile(this.filename(day), "utf8")); }
    catch (error) {
      if (error.code !== "ENOENT") throw new Error("Invalid research archive");
      archive = { schema_version: 1, target_date: day, runs: [] };
    }
    if (archive.schema_version !== 1 || archive.target_date !== day || !Array.isArray(archive.runs)) throw new Error("Invalid research archive");
    archive.collection ||= { version: 1, batches: [], sift: null };
    if (archive.collection.version !== 1 || !Array.isArray(archive.collection.batches) || archive.collection.batches.length > 4
      || new Set(archive.collection.batches.map((batch) => batch.slot)).size !== archive.collection.batches.length) throw new Error("Invalid collection archive");
    completedPool(archive);
    return archive;
  }
  async save(archive) {
    const filename = this.filename(archive.target_date);
    completedPool(archive);
    await mkdir(path.dirname(filename), { recursive: true });
    const paths = [`data-raw/${archive.target_date}.json`];
    for (const batch of archive.collection?.batches || []) {
      if (!batch.result) continue;
      const number = COLLECTION_SLOTS.indexOf(batch.slot) + 1;
      if (typeof batch.capturedAt !== "string" || new Date(batch.capturedAt).toISOString() !== batch.capturedAt) throw new Error("Invalid batch timestamp");
      const relative = `data-raw/${archive.target_date}.discovery-${number}.json`;
      const snapshotPath = path.join(this.checkout, relative);
      const snapshot = {
        schema_version: 1, target_date: archive.target_date, batch: number,
        captured_at: batch.capturedAt,
        coverage: { from_hour: batch.fromHour, through_hour: batch.slot },
        output: batch.result.output, metadata: batch.result.metadata
      };
      const text = JSON.stringify(snapshot, null, 2) + "\n";
      try {
        if (await readFile(snapshotPath, "utf8") !== text) throw new Error("Completed discovery snapshot differs");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        await writeFile(`${snapshotPath}.tmp`, text, "utf8");
        await rename(`${snapshotPath}.tmp`, snapshotPath);
        paths.push(relative);
      }
    }
    await writeFile(`${filename}.tmp`, JSON.stringify(archive, null, 2) + "\n", "utf8");
    await rename(`${filename}.tmp`, filename);
    // The Git push is awaited before the next paid step. A failed claim prevents
    // submission, and a failed result push prevents sift/publication.
    await this.persist(paths, `Checkpoint ${archive.target_date} research`);
  }
}
