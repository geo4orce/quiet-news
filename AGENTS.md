# Quiet News maintenance

Production static site and Git-backed daily note. Keep it dependency-free:
plain HTML/CSS/JS, Node.js 24, no build system. Avoid em dashes.

## Working rules

- Read README and this file before changes. Preserve unrelated edits; run
  `npm run check` before handoff. Browser work uses `npm run dev` at
  `http://localhost:4173/`.
- Tests mock OpenAI. Live provider calls and provider mutations require explicit
  approval. During alpha, test core behavior and costly boundaries, not every
  branch or presentation detail.
- Literal prompts and their version manifest belong only in private
  `geo4orce/quiet-news-publisher` (QNP). Never put prompts, credentials, complete
  provider responses or hidden reasoning in this repo, logs or history.
  The ignored `.env` may contain `OPENAI_API_KEY`.
- `package.json` owns the application version; release tags match `vX.Y.Z`.
  Daily data does not bump versions. MIT covers code/docs, not daily content.
- Application changes belong here; DigitalOcean resource decisions belong in
  `geo4orce/infra`. Schedules live in the publisher app; infra's
  `apps/quiet-news.yaml` describes the static website only.

## Product and browser

- DEV-only illustration trial: stories are always expanded, with no story
  toggle controls. `public/illustrations.js` maps exact dates/headlines to
  optional static images. The September 11 trial is labeled and remains
  accessible from its dated link after current content expires. Missing images
  must not block text. No recurring image generation is configured. Keep this
  experiment on `dev` until explicitly approved for production.

- Filter interruptions from the completed previous `America/New_York` day.
  Zero stories is success; never fill a quota. Use plain, calm, person-to-person
  language, strong sourcing and attribution. Do not imitate a news outlet.
- Keep `edition_date` for compatibility; do not use "edition" in product copy.
- Exact states: current quiet day `Today is quiet. Come back tomorrow.`, saved
  quiet day `Quiet.`, missing past day `Unavailable.`, current New York day or
  future `Not yet.`, load/validation failure `Error.`.
- Default loads `/data/current.json` with expiry; valid `?date=YYYY-MM-DD`
  loads that dated file without expiry. Remove malformed date parameters.
  Check index membership for past dates; missing data is not a quiet result.
- Calendar enables indexed dates only and stays within indexed months. Its
  latest date links to `/` and is selected on the homepage. Show `Today` linking
  to `/` on other dated pages only.
  The picker button says `Jump to date` on `/`, otherwise the requested date.
  Weeks start Monday; two-letter weekday labels match disabled-day gray.
  Invalid/missing index hides the calendar without blocking current content.
  Show sources per story; preserve accessible loading and reduced motion.
- Sanitize browser warnings/errors; never include raw input or response bodies.
  Sitemap lists only the canonical homepage; robots advertises the sitemap.

## Storage and contracts

- `public/data` on `main` is production storage/history. Dated JSON contains
  `edition_date`, canonical UTC `published_at`/`expires_at`, and `stories`.
  Normal expiry is 05:00 New York the following day. Stories have nonempty
  headline/body and named absolute HTTPS sources; public limit 0-20.
  See `lib/publication.mjs`, `lib/edition.mjs`, and tests for validation.
- Reject unknown fields, partial/invalid data and stale current content.
  `current.json` exactly matches its dated file; `index.json` lists all dated
  files uniquely, newest first. Corrections update both copies when current;
  change index only when adding/removing dates. Never delete to regenerate.
- `data-raw` is public on GitHub but must never be served under `public/`.
  Daily `schema_version=1` retains historical `runs` and
  `collection.version=1` with batches and sift. Preserve schema/history.
- The daily checkpoint stores claims, response IDs, attempts, coverage, exact
  prior stories, validated results and metadata. Results are also in immutable
  `.discovery-1.json` through `.discovery-4.json` snapshots, ordered 06:07,
  12:07, 18:07, then next morning 03:07. Failed batches have no snapshot.
  Push the daily checkpoint and new snapshot together. Sift replays completed
  daily-checkpoint batches to reconstruct the pool. See `lib/collection.mjs`.

## Scheduled generation

- QNP's container clones fresh public `main`, runs checks, and imports
  `jobs/checkpointed.mjs` with `QUIET_NEWS_MODE=collect` or `publish`.
- New York collection: 06:07/12:07/18:07 through those hours, then 03:07 finishes
  the previous day through midnight and reconciles late reporting. Successful
  batches cover gaps since the last success. Publish at 04:07; 04:37 is recovery.
  Existing publications exit before loading prompts or calling the provider.
- Publish with full midnight coverage or three validated batches out of four.
  Record partial coverage/missing intervals in sift input, research and warning;
  never relabel failed collection as successful.
- Four independent collections and one independent sift use `gpt-5.6-sol`,
  background Responses, `store:false`, strict schemas and private prompts.
  No shared model conversation or `previous_response_id`.
- Collection: medium reasoning, web search, up to 20 new/changed neutral candidates
  per batch and 80 retained. Preserve unchanged candidates; apply updates and
  withdrawals with stable IDs and surviving duplicate replacements. No ranking,
  scoring or public text; never truncate late candidates. Input includes the
  current pool and exact prior-day published stories.
- Sift: high reasoning, no tools, validated pool plus prior-day stories. Reject
  borderline items, with no quota. Decide every candidate exactly once using
  only its sources. Only sift creates public text. Preserve rejection codes in
  `lib/sift-result.mjs` and QNP's private 10-story ceiling.
- Bounds: collection 6 tool calls (10 final pass), 12,000 output tokens; sift
  20,000 output tokens. Collection warns at 5 minutes, sift at 3; both deadlines
  are 10 minutes, network timeouts 30 seconds, containers 20 minutes.
- Atomically save/push every claim, response ID and result before further paid
  work. Failed claim push prevents submission; failed result push stops
  generation. Git conflicts fail closed, with no force push.
- Poll the same response ID; attempt cancellation at deadline. Unknown submission
  outcomes must not resubmit. Known retryable terminal failures allow one later
  retry, persisted maximum two attempts. Never silently regenerate completed,
  expired or cancelled requests. Invalid/refused/incomplete output fails closed.
  Temporary provider retention and hard container stops can still lose work.
- Save sift before publication and reuse after push failure. Recovery must match
  date, configuration and prior-day context. Legacy `jobs/publisher.mjs` and
  `scripts/recover-day.mjs` require explicit recovery authorization; retain
  5/3-minute foreground deadlines and one retry per stage. Manual review may
  exclude selections via `review.exclusions`, never add/rewrite model stories.

## Diagnostics and navigation

- Scheduled code prints readable progress/warnings directly; QNP suppresses
  subprocess chatter and prints the final outcome after push success. Never log
  candidate/story bodies, raw errors, prompts, secrets or reasoning.
- `node scripts/generation-trends.mjs` reads saved timing/usage/checkpoints.
  `scripts/export-run-history.ps1` reads older JSON logs only. Inspect current
  early failures in DigitalOcean; provider dashboard usage covers billed work
  absent from saved metadata.
- `public/`: site; `lib/`: contracts/storage/provider logic; `jobs/`: entry points;
  `scripts/`: validation/dev/recovery; `tests/`: mocks; `.github/workflows/`: checks.
- Before changing prompts, models, versions or provider options, coordinate with
  QNP and recheck official docs: [model](https://developers.openai.com/api/docs/models/gpt-5.6-sol),
  [latest model](https://developers.openai.com/api/docs/guides/latest-model),
  [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
  [background](https://developers.openai.com/api/docs/guides/background).
