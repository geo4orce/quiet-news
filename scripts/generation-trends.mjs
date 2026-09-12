import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addCalendarDays, newYorkDay } from "../lib/new-york-day.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const rows = [];
const seenResponses = new Set();
const logs = process.argv[2];
if (logs) {
  for (const line of (await readFile(logs, "utf8")).split(/\r?\n/).filter(Boolean)) {
    const invocation = JSON.parse(line);
    const targetDate = addCalendarDays(newYorkDay(invocation.startedAt), -1);
    for (const record of invocation.records) {
      if (!["generation_stage_complete", "generation_failed", "publisher_job_failed"].includes(record.event)) continue;
      if (record.event === "publisher_job_failed" && invocation.records.some((r) => r.event === "generation_failed")) continue;
      if (!record.stage) continue;
      if (record.responseId) seenResponses.add(record.responseId);
      rows.push({ ...record, targetDate: record.targetDate || targetDate,
        runAt: invocation.startedAt, outcome: record.code || "success",
        attempts: record.attempts ?? record.providerAttempts, source: "scheduled" });
    }
  }
}
for (const file of (await readdir(path.join(root, "data-raw"))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
  const archive = JSON.parse(await readFile(path.join(root, "data-raw", file), "utf8"));
  for (const run of archive.runs) for (const stage of ["discovery", "sift"]) {
    const metadata = run[stage]?.metadata;
    if (!metadata || seenResponses.has(metadata.responseId)) continue;
    rows.push({ ...metadata, stage, targetDate: archive.target_date, runAt: run.captured_at,
      outcome: "success", source: "archive" });
    seenResponses.add(metadata.responseId);
  }
}
rows.sort((a, b) => a.runAt.localeCompare(b.runAt));
const safe = (value) => value === null || value === undefined ? "?" : String(value).replace(/[|\r\n]/g, " ");
const seconds = (value) => Number.isFinite(value) ? (value / 1000).toFixed(1) : "?";
const time = (value) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
console.log("# Generation timing\n");
console.log(`Generated ${new Date().toISOString()}. Run times are America/New_York.\n`);
console.log("Total seconds includes retries and retry waits. Last attempt is measured separately in new logs; ? means unavailable. Tokens and searches describe returned responses, not all billed work on failed requests. Scheduled rows use invocation start time; archive-only rows use discovery capture time. Archive success is not proof of a Git push. A returned model differing from the requested model is shown with ->. Timings and usage show correlations, not the provider's internal reason for latency.\n");
for (const stage of ["discovery", "sift"]) {
  console.log(`## ${stage}\n`);
  console.log("| Run NY | Target day | Result | Attempts | Total sec | Last attempt sec | Deadline sec | Input / output tokens | Searches | Model / prompt | HTTP |\n|---|---|---|---:|---:|---:|---:|---|---:|---|---:|");
  for (const r of rows.filter((r) => r.stage === stage)) {
    const returnedModel = r.responseModel && r.responseModel !== r.model ? ` -> ${safe(r.responseModel)}` : "";
    const reasoning = Number.isInteger(r.reasoningTokens) ? ` (${r.reasoningTokens} reasoning)` : "";
    console.log(`| ${time(r.runAt)} | ${r.targetDate} | ${safe(r.outcome)} | ${safe(r.attempts)} | ${seconds(r.durationMs)} | ${seconds(r.attemptDurationMs)} | ${seconds(r.timeoutMs)} | ${safe(r.inputTokens)} / ${safe(r.outputTokens)}${reasoning} | ${safe(r.webSearchCalls)} | ${safe(r.model)}${returnedModel} / ${safe(r.promptVersion)} | ${safe(r.httpStatus)} |`);
  }
  console.log();
}
