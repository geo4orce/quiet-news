import { cp, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { generatePages } from "../lib/site.mjs";

export async function buildSite(checkout, options = {}) {
  const root = path.resolve(checkout);
  const source = path.join(root, "public");
  const output = path.join(root, "dist");
  // Validate and render the complete archive before touching the previous output.
  const pages = await generatePages(source, options);
  const cache = path.join(root, ".cache");
  await mkdir(cache, { recursive: true });
  const staging = await mkdtemp(path.join(cache, "site-"));
  const stagedSite = path.join(staging, "site");
  const previous = path.join(staging, "previous");
  let movedPrevious = false;
  try {
    await cp(source, stagedSite, { recursive: true });
    for (const [name, html] of pages) {
      const target = path.join(stagedSite, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, html);
    }
    try { await rename(output, previous); movedPrevious = true; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    try { await rename(stagedSite, output); }
    catch (error) {
      if (movedPrevious) await rename(previous, output);
      throw error;
    }
  } finally {
    // This generated directory is always inside this checkout's .cache.
    if (!staging.startsWith(`${cache}${path.sep}`)) throw new Error("Invalid build staging directory");
    // Keep the backup if a failed rollback left it as the only completed build.
    if (existsSync(output) || !movedPrevious) await rm(staging, { recursive: true, force: true });
  }
  return { directory: output, dates: [...pages.keys()].filter((name) => /^\d{4}-\d{2}-\d{2}\//.test(name)).length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await buildSite(fileURLToPath(new URL("../", import.meta.url)), {
      noindex: process.argv.includes("--noindex")
    });
    console.log(`Generated ${result.dates} saved days in dist.`);
  } catch {
    console.error("Quiet News site generation failed. Previous output was preserved where possible.");
    process.exitCode = 1;
  }
}
