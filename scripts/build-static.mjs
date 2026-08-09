import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const root = process.cwd();
const output = join(root, "_static");
const publicFiles = [
  "index.html",
  "app.js",
  "mock-data.js",
  "styles.css",
  "favicon.svg",
  "data/snapshot.json",
  "scripts/snapshot.mjs"
];

if (dirname(output) !== root || basename(output) !== "_static") {
  throw new Error("Refusing to build outside the repository output directory.");
}

await rm(output, { recursive: true, force: true });

for (const relativePath of publicFiles) {
  const destination = join(output, relativePath);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(root, relativePath), destination);
}

console.log(`Built ${publicFiles.length} public files in _static.`);
