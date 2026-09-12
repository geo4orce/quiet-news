# Quiet News agent context

Quiet News is a production static site and Git-backed daily note. Keep it
small, dependency-free, and understandable without a build system.

## Authority and invariants

- `README.md` is the short public introduction and local entry point.
- `AGENTS.md` owns the technical contract, operating context, and maintenance
  rules.
- `public/data` on `main` is production storage, history, backup, and audit
  log. Validated discovery candidates and sift decisions are saved in
  `data-raw/YYYY-MM-DD.json` and completed batch snapshots
  `data-raw/YYYY-MM-DD.discovery-1.json` through `.discovery-4.json` on this
  repository's `main`, using the existing publisher token. These files are
  publicly readable on GitHub but must never
  be written under `public/` or served by the website. Never archive literal
  prompts, credentials, complete provider responses, or hidden reasoning.
- The browser uses plain HTML, CSS, and JavaScript. A DigitalOcean App Platform
  scheduled job owns generation. The literal discovery and sift prompts live
  only in the private `geo4orce/quiet-news-publisher` repository.
- Production secrets are encrypted DigitalOcean runtime variables. They are
  `OPENAI_API_KEY` and a write credential scoped to this repository.
- DigitalOcean configuration lives at
  https://github.com/geo4orce/infra/tree/main/apps.
- `package.json` is the only application version source. Release tags use the
  matching `vX.Y.Z`; daily files do not change the version.
- The MIT License covers source code and documentation, not daily content
  under `public/data` or `data-raw`.
- `public/sitemap.xml` lists only the canonical homepage. Dated query states
  and JSON files are not canonical pages. `public/robots.txt` advertises the
  sitemap.
- `edition_date` remains in public JSON for compatibility. Do not use
  "edition" in product copy.

## Product contract

- Quiet News is positioned as an AI-powered interruption filter, not a
  conventional news aggregator. It does not fill space to maintain a feed or
  satisfy an engagement quota. Silence is a valid product result.
- Quiet News passes along only a few things from the completed previous
  `America/New_York` day, or zero on quiet days. Zero stories is a successful
  quiet result.
- The voice is plain, direct, calm, and person-to-person. It must not imitate
  a newspaper, magazine, broadcast, newsletter, press release, or official
  channel.
- Word-of-mouth clarity does not relax sourcing. Rumor, uncertainty, and
  disputed claims require clear attribution and strong reasons to appear.
- A valid current zero-story result says
  `Today is quiet. Come back tomorrow.` A valid saved zero-story day says
  `Quiet.` A past date without a saved file says `Unavailable.` The current
  New York day and future dates say `Not yet.` Publication load or validation
  failures say `Error.`

## Public data and browser contract

Each day is stored at `public/data/YYYY-MM-DD.json`. `current.json` is an
exact copy of the current dated file. `index.json` lists every available date
newest first.

```json
{
  "edition_date": "2026-08-15",
  "published_at": "2026-08-16T08:07:00.000Z",
  "expires_at": "2026-08-17T09:00:00.000Z",
  "stories": [
    {
      "headline": "Short factual title",
      "body": "What happened and why it matters.\n\nUseful context when needed.",
      "sources": [
        {
          "name": "Source name",
          "url": "https://example.com/article"
        }
      ]
    }
  ]
}
```

Data rules:

- `edition_date` is the completed New York calendar day summarized.
- `published_at` and `expires_at` are canonical UTC ISO timestamps. Normal
  expiry is 5:00 a.m. New York time the following day.
- `stories` contains zero to 20 items. This is a public runaway-output safety
  boundary, not the private editorial contract. Titles and bodies are non-empty.
  Every story has at least one source with a non-empty name and absolute HTTPS
  URL.
- Unknown fields, partial output, invalid files, and stale current files are
  rejected.
- `current.json` and its dated file are identical.
- `index.json` contains unique dates newest first and agrees with the dated
  files.

Browser rules:

- The initial loading state uses a small accessible indicator. Its motion is
  disabled when the visitor prefers reduced motion, and it is replaced when
  loading reaches a content or terminal state.
- The default page loads `/data/current.json` and applies expiry. A valid
  `?date=YYYY-MM-DD` loads that dated file without expiry.
- A requested past date absent from `index.json` says `Unavailable.` A date on
  or after the current New York day says `Not yet.` A malformed date parameter
  is removed and the default page is shown.
- The calendar enables only indexed dates, stays within months containing
  indexed days, and returns to the default page through `Today`.
- Story sources appear with each item. A missing or invalid index hides the
  optional calendar without blocking current content.
- Expected unavailable archive requests and malformed dates produce sanitized
  warnings. Publication load and validation failures produce sanitized errors.
  Logs must not include response bodies, raw malformed input, or secrets.

## Generation contract

Production uses four collection requests and one independent morning sift.
Both use gpt-5.6-sol, store:false, background Responses, strict JSON Schema,
and separately injected private prompts. No previous_response_id or shared
reasoning state is passed between requests. The private manifest owns versions.

Collection uses medium reasoning with web search. Each batch returns up to 20
new or changed neutral candidates with stable IDs, event date, compact factual
summary, category, geography and exact HTTPS sources. Unchanged candidates
survive. Explicit withdrawals handle duplicate consolidation, factual
correction/withdrawal and wrong-day assignment. Duplicate withdrawals name a
surviving replacement. Four batches may retain up to 80 candidates; never
truncate late candidates to favor early arrivals. Field sizes are bounded.
Collection must not create public stories, scores, rankings, recommendations,
confidence or hidden reasoning. Exact prior-day stories provide continuity.

Quiet sift uses high reasoning without tools. It receives the validated pool
for the completed New York day and exact prior-day stories. It starts from
exclusion and rejects weak, speculative, sensational, narrow-interest, routine,
incremental, duplicate, stale, displaced or merely procedural developments.
There is no quota; borderline items are rejected. Only sift creates public
story text. It decides every candidate exactly once and uses only that
candidate's source records. The existing public story limits and private
editorial ceiling remain unchanged. Rejection codes remain:

outside_target_day, insufficient_materiality, narrow_interest,
incremental_update, duplicate_event, prior_day_repetition, weak_support,
speculative_or_sensational, displaced_by_stronger_story.

Before changing private prompts, versions, models or provider configuration,
update the private publisher repository and recheck:

- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/background

## Publishing and observability

DigitalOcean collect-news runs at 03:07, 06:07, 12:07 and 18:07 New York time.
Daytime runs cover the current day through 06:00, 12:00 and 18:00. The 03:07
run completes the previous day through midnight and reconciles late reporting,
corrections and duplicates. Each successful batch covers the interval since
the last successful batch, including gaps left by missed daytime runs.

publish-daily runs at 04:07 with recovery at 04:37. It can publish after full
coverage through midnight, or from three of four validated collection batches
when one run is missing or failed. A partial day records its actual coverage
and missing interval in the sift input, saved research and sanitized warning.
It never marks the failed collection successful. Sift still decides whether
any saved candidate warrants publication; insufficient data, invalid output or
publication failure remain errors. A completed sift is saved before publication
and reused after a publication failure. An existing dated file exits before prompt loading or
provider access. Normal success uses four collection calls and one sift call.
The second morning invocation does not redo completed discovery or sift.

Every invocation starts an ephemeral private-publisher container, shallow-
clones public main and validates it. The private runner sets QUIET_NEWS_MODE
to collect or publish and imports jobs/checkpointed.mjs. It commits only dated
raw JSON and publication JSON. Every claim, response ID and completed result
is written atomically and pushed before the next paid step. A rejected claim
push prevents submission; a failed result push prevents further generation.
Concurrent Git push conflicts fail closed without force-pushing over work.

The existing data-raw/YYYY-MM-DD.json schema_version remains 1 and historical
runs remain intact. New collection.version=1 holds up to four batches and a
separate sift checkpoint. Each batch contains coverage, observation time,
exact prior stories, request coordination, and validated delta output plus
metadata. Each completed batch also writes an immutable
data-raw/YYYY-MM-DD.discovery-N.json snapshot, where N is 1 through 4 in
06:07, 12:07, 18:07 and following-morning 03:07 order. The snapshot includes
captured_at, coverage, validated output and metadata. Failed batches have no
completed snapshot. Push the snapshot and daily checkpoint together. Replay
completed batches to reconstruct the pool. Sift retains its input fingerprint,
prior stories, coverage, request and validated decision envelope.
These records are public on GitHub and excluded from the website. Never save
literal prompts, complete provider responses, credentials or hidden reasoning.

Discovery warns after five minutes while polling the same background response.
Its overall deadline is fourteen minutes. Sift warns after three minutes and
is bounded at ten minutes. Each network exchange has a thirty-second timeout;
poll retries retrieve the same ID without starting new generation. At the
overall deadline the worker attempts cancellation. Container timeout stays
at twenty minutes. An interrupted submission with unknown outcome remains
unknown and is not automatically submitted again. A known retryable terminal
failure may be retried once in a later invocation, with a persisted two-attempt
limit. Completed, expired and cancelled requests are not silently regenerated.

Background store:false temporary retention does not guarantee retrieval thirty
minutes later. Workers poll promptly and save completed output. A hard
container stop or unresolved Git failure can still lose unreturned or
uncommitted work. Invalid, refused, incomplete or expired results fail closed.

Each daytime batch permits six built-in tool calls; the final pass permits ten.
Collection output is capped at 12,000 tokens; sift has no tools and a 20,000-
output-token boundary. These are workload bounds, not dollar estimates or a
guarantee of source coverage. Provider budgets, cost alerts and other provider-
side mutations still require explicit approval. Dashboard usage is authoritative
for billed work missing from returned response metadata.

Logs contain only sanitized stage, date, model, prompt version, response and
request IDs, durations, attempts, usage and counts. Slow logs state that the
same request continues. Unknown submission, failed polling, expiry, coverage
gaps and checkpoint failures have separate codes. Never log candidate bodies,
public story bodies, prompts, secrets, provider error bodies or reasoning.
Timing reports include historical runs and new collection/sift checkpoints.

The old two-stage generator and scripts/recover-day.mjs remain for explicitly
authorized legacy recovery. Its foreground deadlines remain five minutes for
discovery and three for sift, with one retry per stage. It retains actual
publication time, normal expiry and audited review.exclusions. It may reuse
validated work only when date, configuration and prior-day context match.
Manual review can exclude selections, but cannot add or rewrite model stories.
Never delete a saved publication to force regeneration.

## Repository map

- `public/`: static website and public JSON history
- `data-raw/`: publicly readable analysis archive, excluded from the website
- `jobs/`: public publisher entry point used by the private runner
- `lib/`: generation contracts, prompt injection, validation, date logic, and
  storage
- `scripts/`: history validation and local development server
- `tests/`: small Node test suite with provider mocks
- `.github/workflows/`: ordinary repository checks only

## Working rules

- Read `README.md` and this file before changing product behavior, data
  contracts, generation, or operations.
- Use `npm run dev` for browser work at `http://localhost:4173/`. There is no
  build step.
- Preserve unrelated local changes. Run `npm run check` after changes and
  before handoff.
- Tests must mock OpenAI. Do not make a live provider call unless the user
  explicitly requests it.
- Never add literal generation prompts to this repository, its tests, fixtures,
  logs, documentation, or history.
- During alpha, test costly boundaries and core behavior. Avoid exhaustive
  branch coverage and tests that pin presentation details.
- Never expose or commit secrets. The ignored local `.env` may contain
  `OPENAI_API_KEY`.
- To correct a saved day, edit its dated file and, when current, make the
  identical edit to `current.json`. Change `index.json` only when adding or
  removing a date. Never delete a dated file to force regeneration.
- Keep application changes here and DigitalOcean resource decisions in the
  infra repository. Provider mutations require explicit approval.
