import { backgroundResponse } from "../lib/background-response.mjs";
import { COLLECTION_OUTPUT_SCHEMA, CollectionStore, collectionWindow, collectionReadiness, completedPool, localBoundary, mergeCollection, poolFingerprint } from "../lib/collection.mjs";
import { GENERATION_MODEL, siftInput } from "../lib/generation-prompts.mjs";
import { requestBody, GenerationError } from "../lib/openai-generator.mjs";
import { addCalendarDays, publicationWindow } from "../lib/new-york-day.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { createPublication } from "../lib/publication.mjs";
import { assertSiftResult, countRejections, editionFromSiftResult, SIFT_OUTPUT_SCHEMA } from "../lib/sift-result.mjs";

const pooledSiftSchema = structuredClone(SIFT_OUTPUT_SCHEMA);
pooledSiftSchema.properties.rejections.maxItems = 80;
const storiesFrom = (publication) => publication ? { stories: publication.stories } : { stories: [] };

export async function runCheckpointedJob({
  mode, checkout, apiKey, loadPrompts, persist, logger = console, now = () => new Date(),
  execute = backgroundResponse, assertStoryLimit = () => {},
  publications = new PublicationStore(`${checkout}/public/data`), research = new CollectionStore(checkout, persist)
}) {
  if (!["collect", "publish"].includes(mode)) throw new Error("Unknown publisher mode");
  const instant = now();
  const window = mode === "collect" ? collectionWindow(instant) : { targetDate: publicationWindow(instant).editionDay };
  const day = window.targetDate;
  if (await publications.hasEdition(day)) return { status: "already_published", editionDate: day };
  const archive = await research.read(day);
  let { pool, coveredThrough } = completedPool(archive);
  const prior = storiesFrom(await publications.readEdition(addCalendarDays(day, -1), { optional: true }));
  const save = () => research.save(archive);

  if (mode === "collect") {
    if (window.slot <= coveredThrough) return { status: "already_collected", editionDate: day, slot: window.slot };
    let batch = archive.collection.batches.find((item) => item.slot === window.slot);
    if (!batch) {
      batch = { slot: window.slot, fromHour: coveredThrough, priorStories: prior.stories, request: null, result: null };
      archive.collection.batches.push(batch);
    }
    const prompts = await loadPrompts();
    if (!prompts.collection || !prompts.collectionVersion) throw new Error("Collection prompt missing");
    const input = JSON.stringify({ target_day: day, timezone: "America/New_York",
      window_start: localBoundary(day, batch.fromHour), window_end: localBoundary(day, batch.slot),
      observed_at: batch.observedAt ||= instant.toISOString(), final_pass: window.slot === 24,
      prior_stories: batch.priorStories, known_candidates: pool });
    const body = requestBody({ model: GENERATION_MODEL, reasoningEffort: "medium", maxOutputTokens: 12_000,
      prompt: prompts.collection, input, schema: COLLECTION_OUTPUT_SCHEMA, schemaName: "quiet_news_collection", webSearch: true });
    body.max_tool_calls = window.slot === 24 ? 10 : 6;
    const result = await execute({ apiKey, body, stage: "discovery", targetDate: day, request: batch.request, logger,
      promptVersion: prompts.collectionVersion,
      saveRequest: async (request) => { batch.request = request; await save(); },
      validate: (output) => mergeCollection(pool, output, day) });
    batch.result = { output: result.output, metadata: { ...result.metadata, promptVersion: prompts.collectionVersion, slot: window.slot } };
    batch.request = result.request;
    batch.capturedAt = now().toISOString();
    await save();
    pool = completedPool(archive).pool;
    logger.info?.(JSON.stringify({ event: "collection_complete", targetDate: day, slot: window.slot, candidateCount: pool.length,
      inputTokens: result.metadata.inputTokens, outputTokens: result.metadata.outputTokens, webSearchCalls: result.metadata.webSearchCalls }));
    return { status: "collected", editionDate: day, slot: window.slot, candidateCount: pool.length };
  }

  const { coverage, canPublish } = collectionReadiness(archive);
  if (!canPublish) throw new GenerationError("collection_incomplete", false, { stage: "sift", targetDate: day });
  if (coverage.status === "partial") {
    logger.warn?.(JSON.stringify({ event: "publication_partial_coverage", targetDate: day, ...coverage }));
  }
  const candidateSet = { target_date: day, candidates: pool };
  const fingerprint = poolFingerprint({ candidateSet, prior, coverage });
  let sift = archive.collection.sift;
  if (sift && sift.inputFingerprint !== fingerprint) throw new GenerationError("checkpoint_mismatch", false, { stage: "sift" });
  if (!sift) {
    sift = { inputFingerprint: fingerprint, priorStories: prior.stories, coverage, request: null, result: null };
    archive.collection.sift = sift;
  }
  const reusedSift = Boolean(sift.result);
  if (!sift.result) {
    const prompts = await loadPrompts();
    const input = JSON.stringify({ ...JSON.parse(siftInput(day, prior, candidateSet)), collection_coverage: coverage });
    const body = requestBody({ model: GENERATION_MODEL, reasoningEffort: "high", maxOutputTokens: 20_000,
      prompt: prompts.sift, input, schema: pooledSiftSchema,
      schemaName: "quiet_news_sift", webSearch: false });
    const result = await execute({ apiKey, body, stage: "sift", targetDate: day, request: sift.request, logger,
      promptVersion: prompts.siftVersion,
      softTimeoutMs: 180_000, hardTimeoutMs: 600_000,
      saveRequest: async (request) => { sift.request = request; await save(); },
      validate: (output) => { assertSiftResult(output, candidateSet); assertStoryLimit(editionFromSiftResult(output, candidateSet)); } });
    sift.result = { output: result.output, metadata: { ...result.metadata, promptVersion: prompts.siftVersion } };
    sift.request = result.request;
    await save();
  }
  assertSiftResult(sift.result.output, candidateSet);
  const edition = editionFromSiftResult(sift.result.output, candidateSet);
  assertStoryLimit(edition);
  // A delayed job cannot silently publish an old target into a new day's slot.
  const publication = publicationWindow(now());
  if (publication.editionDay !== day) throw new Error("Publication day changed");
  await publications.publish(createPublication(publication, edition));
  await persist([`public/data/${day}.json`, "public/data/current.json", "public/data/index.json"], `Save ${day} note from collected research`);
  logger.info?.(JSON.stringify({ event: "publisher_complete", status: "published", editionDate: day,
    candidateCount: pool.length, acceptedCount: edition.stories.length, rejectionCounts: countRejections(sift.result.output),
    reusedSift, coverage }));
  return { status: "published", editionDate: day, storyCount: edition.stories.length, coverage };
}
