import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertValidSnapshot } from "./snapshot.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const snapshot = await readJson(resolve(repositoryRoot, "data/snapshot.json"));
const draft = await readJson(resolve(repositoryRoot, "data/draft.json"));

assertValidSnapshot(snapshot);
assertValidSnapshot(draft, { kind: "draft" });

console.log("Snapshot and draft are valid.");
