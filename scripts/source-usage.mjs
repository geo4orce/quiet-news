import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCalendarDays, isCalendarDay, newYorkDay } from "../lib/new-york-day.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const usage = `Usage: npm run sources
       npm run sources -- 30
       npm run sources -- --days 30
       npm run sources -- --help

Direct alternative: node scripts/source-usage.mjs [days]

Omit days for all local history. A positive number includes that many New York
calendar dates ending today; today's collection may be partial.
Prints an aligned Markdown table of source-link counts. Reads local files only.
Save outside the repository (overwrites the named file):
  npm run --silent sources -- 30 > ../quiet-news-sources.md`;
class ReportError extends Error {}

async function report(args) {
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) return usage;
  const value = args[0] === "--days" && args.length === 2 ? args[1]
    : args.length === 1 ? args[0] : undefined;
  if (args.length && (!value || !/^[1-9]\d*$/.test(value)
    || !Number.isSafeInteger(Number(value)))) throw new ReportError(usage);
  const today = newYorkDay();
  let start;
  try {
    start = value ? addCalendarDays(today, 1 - Number(value)) : "0001-01-01";
    if (!isCalendarDay(start)) throw new Error();
  } catch {
    throw new ReportError("The lookback exceeds the supported calendar range.");
  }

  const rows = new Map();
  const dates = { collected: new Set(), sifted: new Set(), published: new Set() };
  const batches = new Set();
  let fixtures = 0;
  let invalidLinks = 0;
  const inRange = (date) => isCalendarDay(date) && date >= start && date <= today;

  function count(items, stage, date) {
    if (!Array.isArray(items)) throw new ReportError("Invalid source records in local history.");
    dates[stage].add(date);
    for (const item of items) {
      if (typeof item?.headline === "string" && item.headline.startsWith("TEST:")) {
        fixtures++;
        continue;
      }
      if (!Array.isArray(item?.sources)) throw new ReportError("Missing sources in local history.");
      for (const source of item.sources) {
        let domain;
        try {
          const url = new URL(source?.url);
          if (url.protocol !== "https:" || !url.hostname) throw new Error();
          domain = url.hostname.toLowerCase().replace(/^www\./, "");
        } catch {
          invalidLinks++;
          continue;
        }
        if (!rows.has(domain)) rows.set(domain, { domain, collected: 0, sifted: 0, published: 0 });
        rows.get(domain)[stage]++;
      }
    }
  }

  async function read(directory, file, dateField) {
    let data;
    try {
      data = JSON.parse(await readFile(path.join(root, directory, file), "utf8"));
    } catch {
      throw new ReportError(`Unable to read or parse ${directory}/${file}.`);
    }
    if (data?.[dateField] !== file.slice(0, 10)) throw new ReportError(`Mismatched date in ${directory}/${file}.`);
    return data;
  }

  const rawFiles = (await readdir(path.join(root, "data-raw"))).sort();
  for (const file of rawFiles.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name))) {
    const date = file.slice(0, 10);
    if (!inRange(date)) continue;
    const archive = await read("data-raw", file, "target_date");
    if (!Array.isArray(archive.runs)) throw new ReportError("Invalid archive in local history.");
    for (const run of archive.runs) {
      if (run.discovery?.output) count(run.discovery.output.candidates, "collected", date);
      if (run.sift?.output) count(run.sift.output.stories, "sifted", date);
    }
    for (const batch of archive.collection?.batches || []) {
      if (!batch.result) continue;
      count(batch.result.output.candidates, "collected", date);
      batches.add(`${date}:${batch.slot}`);
    }
    if (archive.collection?.sift?.result) count(archive.collection.sift.result.output.stories, "sifted", date);
  }

  // Snapshots duplicate checkpoint results. Use them only for missing batches.
  for (const file of rawFiles) {
    const match = /^(\d{4}-\d{2}-\d{2})\.discovery-([1-4])\.json$/.exec(file);
    if (!match || !inRange(match[1])) continue;
    const key = `${match[1]}:${[6, 12, 18, 24][Number(match[2]) - 1]}`;
    if (batches.has(key)) continue;
    const snapshot = await read("data-raw", file, "target_date");
    count(snapshot.output?.candidates, "collected", match[1]);
    batches.add(key);
  }

  const publicFiles = await readdir(path.join(root, "public/data"));
  for (const file of publicFiles.filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort()) {
    const date = file.slice(0, 10);
    if (!inRange(date)) continue;
    const publication = await read("public/data", file, "edition_date");
    count(publication.stories, "published", date);
  }

  const coverage = (stage) => {
    const days = [...dates[stage]].sort();
    return days.length ? `${days.length} dates (${days[0]} to ${days.at(-1)})` : "no saved results";
  };
  const lines = ["# Source usage", "",
    value ? `Last ${value} New York calendar dates: ${start} to ${today}.`
      : `All local history through ${today} (America/New_York).`,
    "Today's results may be partial. Counts describe source links, not trust or audience size.", "",
    "Collected: saved discovery candidates, including updates and historical runs.",
    "Sifted: stories selected by sift, before manual exclusions or publication.",
    "Published: dated public stories. Repeated source links are counted in every column.",
    "Checkpoint/snapshot copies, current.json, and prior-day context are not counted again.",
    "Hostnames omit www.; other subdomains and syndicated hosts stay separate.", "",
    `Collected coverage: ${coverage("collected")}.`,
    `Sifted coverage: ${coverage("sifted")}.`,
    `Published coverage: ${coverage("published")}.`,
    `Excluded ${fixtures} test story records; skipped ${invalidLinks} invalid source links.`, "",
    "Sorted by collected links, then published links, then sifted links.", ""
  ];
  const sorted = [...rows.values()].sort((a, b) => b.collected - a.collected
    || b.published - a.published || b.sifted - a.sifted || a.domain.localeCompare(b.domain));
  const headings = ["Source domain", "Collected", "Sifted", "Published"];
  const cells = sorted.map((row) => [row.domain, row.collected, row.sifted, row.published].map(String));
  const widths = headings.map((heading, column) => Math.max(heading.length,
    ...cells.map((row) => row[column].length)));
  const formatRow = (row) => `| ${row.map((cell, column) => column === 0
    ? cell.padEnd(widths[column]) : cell.padStart(widths[column])).join(" | ")} |`;
  lines.push(formatRow(headings));
  lines.push(`| ${widths.map((width, column) => column === 0
    ? "-".repeat(width) : `${"-".repeat(width - 1)}:`).join(" | ")} |`);
  for (const row of cells) lines.push(formatRow(row));
  if (!sorted.length) lines.push("", "No source links found in this date range.");
  return lines.join("\n");
}

try {
  console.log(await report(process.argv.slice(2)));
} catch (error) {
  // Never print parser errors, source URLs, or archive contents.
  console.error(error instanceof ReportError ? error.message : "Unable to generate source usage from local history.");
  process.exitCode = 1;
}
