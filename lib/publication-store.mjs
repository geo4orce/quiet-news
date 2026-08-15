import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  assertPublication,
  assertPublicationIndex,
  createPublicationIndex
} from "./publication.mjs";

const DEFAULT_DIRECTORY = fileURLToPath(new URL("../public/data/", import.meta.url));

export class ArchiveExistsError extends Error {
  constructor(editionDate) {
    super(`Archive ${editionDate} already exists`);
    this.name = "ArchiveExistsError";
    this.editionDate = editionDate;
  }
}

async function readJson(filename, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(filename, "utf8"));
  } catch (error) {
    if (optional && error?.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicJsonWrite(filename, value) {
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filename);
}

export class PublicationStore {
  constructor(directory = DEFAULT_DIRECTORY) {
    this.directory = directory;
  }

  archivePath(editionDate) {
    return path.join(this.directory, `${editionDate}.json`);
  }

  async hasEdition(editionDate) {
    return (await readJson(this.archivePath(editionDate), { optional: true })) !== null;
  }

  async readEdition(editionDate) {
    const publication = await readJson(this.archivePath(editionDate));
    return assertPublication(publication);
  }

  async readCurrent({ optional = false } = {}) {
    const publication = await readJson(path.join(this.directory, "current.json"), { optional });
    return publication === null ? null : assertPublication(publication);
  }

  async readIndex({ optional = false } = {}) {
    const index = await readJson(path.join(this.directory, "index.json"), { optional });
    return index === null ? null : assertPublicationIndex(index);
  }

  async publish(publication) {
    assertPublication(publication);
    await mkdir(this.directory, { recursive: true });
    if (await this.hasEdition(publication.edition_date)) {
      throw new ArchiveExistsError(publication.edition_date);
    }

    const previousIndex = await this.readIndex({ optional: true });
    const index = createPublicationIndex(
      publication.published_at,
      [publication.edition_date, ...(previousIndex?.dates || [])]
    );

    await atomicJsonWrite(this.archivePath(publication.edition_date), publication);
    await atomicJsonWrite(path.join(this.directory, "current.json"), publication);
    await atomicJsonWrite(path.join(this.directory, "index.json"), index);
    return { publication, index };
  }
}
