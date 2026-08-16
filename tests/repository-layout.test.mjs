import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";

async function pathExists(url) {
  try {
    await access(url);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

test("obsolete database, Function, and root snapshot paths are absent", async () => {
  for (const name of ["data", "database", "functions"]) {
    assert.equal(
      await pathExists(new URL(`../${name}/`, import.meta.url)),
      false,
      `${name}/ must not exist in the Git-backed static application`
    );
  }
});
