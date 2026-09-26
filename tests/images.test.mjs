import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runImageJob, generateStoryImage, IMAGE_OPTIONS } from "../jobs/images.mjs";
import { loadDailyImages, storyImageId, validImageManifest } from "../public/image-manifest.js";

const date = "2026-09-12";
const story = { headline: "Test headline", body: "Test body", sources: [{ name: "Source", url: "https://example.com/news" }] };
const publication = (stories = [story]) => ({ edition_date: date, published_at: "2026-09-13T08:07:00.000Z",
  expires_at: "2026-09-14T09:00:00.000Z", stories });
const jpeg = await readFile(new URL("../public/images/2026-09-11-fuel.jpg", import.meta.url));

async function fixture(t, stories) {
  const checkout = await mkdtemp(path.join(tmpdir(), "qn-images-test-"));
  t.after(() => rm(checkout, { recursive: true, force: true }));
  await mkdir(path.join(checkout, "public/data"), { recursive: true });
  await writeFile(path.join(checkout, `public/data/${date}.json`), JSON.stringify(publication(stories)));
  const events = [];
  const options = { checkout, editionDate: date, apiKey: "test", logger: {},
    loadImagePrompt: async () => ({ version: "test-v1", render: () => "MOCK_PRIVATE" }),
    persist: async (paths) => { events.push(paths); }, generate: async () => { events.push("paid"); return jpeg; } };
  return { options, events, read: async (file) => JSON.parse(await readFile(path.join(checkout, file), "utf8")) };
}

test("image claim precedes paid work; JPEG, manifest and completion are saved before another request", async (t) => {
  const { options, events, read } = await fixture(t, [story, { ...story, headline: "Second" }]);
  assert.deepEqual(await runImageJob(options), { generated: 2, skipped: 0, pending: 0 });
  assert.equal(events[1], "paid");
  assert.equal(events[2].length, 3);
  assert.equal(events[4], "paid");
  const manifest = await read(`public/images/${date}/index.json`);
  assert.ok(validImageManifest(manifest, date));
  assert.equal(Object.keys(manifest.images).length, 2);
  assert.doesNotMatch(JSON.stringify(await read(`data-raw/${date}.images.json`)), /MOCK_PRIVATE|Test body|b64_json/);
  events.length = 0;
  assert.equal((await runImageJob(options)).generated, 0);
  assert.deepEqual(events, []);
});

test("quiet day and insufficient time skip provider and private prompt loading", async (t) => {
  const { options } = await fixture(t, []);
  options.loadImagePrompt = () => { throw new Error("must not load"); };
  assert.deepEqual(await runImageJob(options), { generated: 0, skipped: 0, pending: 0 });
  const second = await fixture(t, [story]);
  assert.equal((await runImageJob({ ...second.options, deadline: 0 })).pending, 1);
  assert.deepEqual(second.events, []);
});

test("failed claim push prevents spending; failed result push prevents the next image", async (t) => {
  const { options, events } = await fixture(t, [story, { ...story, headline: "Second" }]);
  options.persist = async () => { throw new Error("push failed"); };
  await assert.rejects(runImageJob(options));
  assert.deepEqual(events, []);
  const second = await fixture(t, [story, { ...story, headline: "Second" }]);
  let pushes = 0;
  second.options.persist = async () => { if (++pushes === 2) throw new Error("push failed"); };
  await assert.rejects(runImageJob(second.options));
  assert.deepEqual(second.events, ["paid"]);
});

test("uncertain request and interrupted claimed state are never automatically resubmitted", async (t) => {
  const { options, read } = await fixture(t);
  let calls = 0;
  options.generate = async () => { calls++; throw new Error("secret provider response"); };
  assert.equal((await runImageJob(options)).skipped, 1);
  assert.equal((await runImageJob(options)).skipped, 1);
  assert.equal(calls, 1);
  const checkpoint = await read(`data-raw/${date}.images.json`);
  checkpoint.attempts[await storyImageId(story)].status = "claimed";
  await writeFile(path.join(options.checkout, `data-raw/${date}.images.json`), JSON.stringify(checkpoint));
  await runImageJob(options);
  assert.equal(calls, 1);
});

test("image API uses a single bounded JPEG request and never exposes provider error bodies", async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/images/generations");
    assert.deepEqual(JSON.parse(options.body), { ...IMAGE_OPTIONS, prompt: "mock" });
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ data: [{ b64_json: jpeg.toString("base64") }] }) };
  };
  assert.deepEqual(await generateStoryImage({ apiKey: "test", prompt: "mock", fetcher }), jpeg);
  assert.equal(calls, 1);
  await assert.rejects(generateStoryImage({ apiKey: "test", prompt: "mock", fetcher: async () => ({ ok: false }) }),
    { message: "Image provider request failed" });
  await assert.rejects(generateStoryImage({ apiKey: "test", prompt: "mock", fetcher: async () => ({ ok: true,
    json: async () => ({ data: [{ b64_json: Buffer.from("not an image").toString("base64") }] }) }) }));
});

test("production and DEV load matching images and reject unsafe manifests", async () => {
  const id = await storyImageId(story);
  const manifest = { version: 1, edition_date: date, images: { [id]: {
    src: `/images/${date}/${id}.jpg`, alt: "Conceptual illustration", width: 1536, height: 1024
  } } };
  let calls = 0;
  const fetcher = async (url) => { calls++; assert.ok(url.startsWith("https://raw.githubusercontent.com/geo4orce/quiet-news/main/public/images/"));
    return { ok: true, json: async () => manifest }; };
  for (const hostname of ["quietnews.ai", "quiet-news.com", "localhost"]) {
    const result = await loadDailyImages(publication(), { hostname, fetcher: async (url) => {
      assert.equal(url, `/images/${date}/index.json`);
      return { ok: true, json: async () => manifest };
    } });
    assert.equal(result[0].src, `/images/${date}/${id}.jpg`);
  }
  assert.deepEqual(await loadDailyImages(publication([]), { hostname: "quietnews.ai", fetcher }), []);
  assert.equal(calls, 0);
  assert.ok((await loadDailyImages(publication(), { hostname: "quietnews.dev", fetcher }))[0].src.includes(id));
  assert.deepEqual(await loadDailyImages(publication([{ ...story, body: "Corrected" }]), { hostname: "quietnews.dev", fetcher }), [null]);
  manifest.images[id].src = "https://untrusted.example/image.jpg";
  assert.deepEqual(await loadDailyImages(publication(), { hostname: "quietnews.dev", fetcher }), []);
  assert.deepEqual(await loadDailyImages(publication(), { hostname: "quietnews.dev", fetcher: async () => { throw new Error("offline"); } }), []);
});
