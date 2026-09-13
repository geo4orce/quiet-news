import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { PublicationStore } from "../lib/publication-store.mjs";
import { storyImageId, validImageManifest } from "../public/image-manifest.js";

export const IMAGE_OPTIONS = Object.freeze({
  model: "gpt-image-1.5", quality: "medium", size: "1536x1024",
  output_format: "jpeg", output_compression: 80, n: 1
});
const REQUEST_TIMEOUT = 120_000;

async function optionalJson(filename) {
  try { return JSON.parse(await readFile(filename, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function atomicWrite(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(`${filename}.tmp`, value);
  await rename(`${filename}.tmp`, filename);
}
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function assertJpeg(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > 5_000_000
    || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) {
    throw new Error("Invalid generated JPEG");
  }
  // Check the encoded dimensions without decoding or adding an imaging dependency.
  let offset = 2;
  while (offset + 9 < bytes.length && bytes[offset] === 255) {
    const marker = bytes[offset + 1];
    if (marker === 218) break;
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > bytes.length) break;
    if ([192, 193, 194].includes(marker)) {
      if (bytes.readUInt16BE(offset + 5) === 1024 && bytes.readUInt16BE(offset + 7) === 1536) return bytes;
      break;
    }
    offset += length + 2;
  }
  throw new Error("Invalid generated JPEG dimensions");
}

export async function generateStoryImage({ apiKey, prompt, fetcher = fetch }) {
  // The synchronous Images API has no resumable response ID. Never retry this POST.
  const response = await fetcher("https://api.openai.com/v1/images/generations", {
    method: "POST", signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...IMAGE_OPTIONS, prompt })
  });
  if (!response.ok) throw new Error("Image provider request failed");
  const value = await response.json();
  const encoded = value?.data?.[0]?.b64_json;
  if (value?.data?.length !== 1 || typeof encoded !== "string" || encoded.length > 7_000_000
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid image provider result");
  return assertJpeg(Buffer.from(encoded, "base64"));
}

export async function runImageJob({ checkout, editionDate, apiKey, loadImagePrompt, persist,
  maxStories = 10, deadline = Date.now() + 8 * 60_000, now = Date.now,
  generate = generateStoryImage, logger = console }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(editionDate)) throw new Error("Invalid image date");
  const publication = await new PublicationStore(path.join(checkout, "public/data")).readEdition(editionDate);
  if (publication.stories.length > maxStories) throw new Error("Image story limit exceeded");
  if (publication.stories.length === 0) return { generated: 0, pending: 0, skipped: 0 };
  const statePath = `data-raw/${editionDate}.images.json`;
  const manifestPath = `public/images/${editionDate}/index.json`;
  const state = await optionalJson(path.join(checkout, statePath))
    ?? { version: 1, edition_date: editionDate, attempts: {} };
  const manifest = await optionalJson(path.join(checkout, manifestPath))
    ?? { version: 1, edition_date: editionDate, images: {} };
  if (state.version !== 1 || state.edition_date !== editionDate || !state.attempts
    || typeof state.attempts !== "object" || Array.isArray(state.attempts)
    || !validImageManifest(manifest, editionDate)) throw new Error("Invalid image checkpoint");
  let generated = 0;
  let pending = 0;
  let skipped = 0;
  let config;
  for (const story of publication.stories) {
    const id = await storyImageId(story);
    if (manifest.images[id]) continue;
    // A claim survives timeout, process death, prompt changes and recovery runs.
    if (Object.hasOwn(state.attempts, id)) { skipped++; continue; }
    if (now() + REQUEST_TIMEOUT + 30_000 > deadline) { pending++; continue; }
    config ??= await loadImagePrompt();
    if (!config?.version || typeof config.render !== "function") throw new Error("Invalid private image configuration");
    const prompt = config.render(story);
    if (typeof prompt !== "string" || !prompt.trim()) throw new Error("Empty private image prompt");
    state.attempts[id] = {
      status: "claimed", claimed_at: new Date(now()).toISOString(),
      model: IMAGE_OPTIONS.model, quality: IMAGE_OPTIONS.quality, prompt_version: config.version
    };
    await atomicWrite(path.join(checkout, statePath), json(state));
    await persist([statePath], `Claim ${editionDate} story image ${id.slice(0, 12)}`);
    let bytes;
    try { bytes = assertJpeg(await generate({ apiKey, prompt })); }
    catch {
      state.attempts[id].status = "unavailable";
      await atomicWrite(path.join(checkout, statePath), json(state));
      await persist([statePath], `Record unavailable ${editionDate} story image`);
      logger.warn?.("Story image unavailable; automatic retry disabled to prevent duplicate charges.");
      skipped++;
      continue;
    }
    const image = {
      src: `/images/${editionDate}/${id}.jpg`,
      alt: `AI-generated conceptual illustration: ${story.headline}`.slice(0, 1000),
      width: 1536, height: 1024
    };
    manifest.images[id] = image;
    if (!validImageManifest(manifest, editionDate)) throw new Error("Invalid image manifest");
    state.attempts[id].status = "completed";
    state.attempts[id].completed_at = new Date(now()).toISOString();
    await atomicWrite(path.join(checkout, `public${image.src}`), bytes);
    await atomicWrite(path.join(checkout, manifestPath), json(manifest));
    await atomicWrite(path.join(checkout, statePath), json(state));
    // If this push fails, stop before another paid request. The remote claim prevents regeneration.
    await persist([statePath, manifestPath, `public${image.src}`], `Save ${editionDate} story image ${id.slice(0, 12)}`);
    generated++;
    logger.info?.(`Story image ${generated} saved to GitHub.`);
  }
  return { generated, pending, skipped };
}
