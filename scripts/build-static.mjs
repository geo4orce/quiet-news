import { copyFile, mkdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const root = process.cwd();
const output = join(root, "_static");
if (dirname(output) !== root || basename(output) !== "_static") {
  throw new Error("Refusing to build outside the repository output directory.");
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await copyFile(join(root, "public", "index.html"), join(output, "index.html"));

console.log("Built one public file in _static.");
