import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { validImageManifest } from "../public/image-manifest.js";
import { assertJpeg } from "../jobs/images.mjs";

const root = new URL("../public/images/", import.meta.url);
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue; // Original static trial JPEGs are retained.
  assert.match(entry.name, /^\d{4}-\d{2}-\d{2}$/);
  const manifest = JSON.parse(await readFile(new URL(`${entry.name}/index.json`, root), "utf8"));
  assert.ok(validImageManifest(manifest, entry.name), "Invalid image manifest");
  for (const image of Object.values(manifest.images)) {
    assertJpeg(await readFile(new URL(`../public${image.src}`, import.meta.url)));
  }
}
console.log("Validated daily image manifests");
