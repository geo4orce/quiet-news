# Quiet News agent context

Quiet News is a production static site and Git-backed daily note. Keep it
small, dependency-free, and understandable without a build system.

## Authority and invariants

- `README.md` is the short public introduction and local entry point.
- `AGENTS.md` owns the technical contract, operating context, and maintenance
  rules.
- `public/data` on `main` is production storage, history, backup, and audit
  log. Discovery candidates and rejection metadata must never be written
  under `public/` or committed.
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
  under `public/data`.
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

Discovery and quiet sift are separate Responses API requests. Both use
`gpt-5.6-sol`, `store: false`, strict JSON Schema output, separately injected
private system prompts, and no `previous_response_id` or shared reasoning
state. Prompt versions travel with the private prompts and appear only as
metadata in public generation logs.

Discovery uses medium reasoning and web search. It returns zero to 20 neutral
candidates for the target day, each with a unique ID, event date, title,
summary, category, geography, and exact source links. It collapses duplicate
reports and uses the exact prior day's stories only for continuity and
deduplication. It must not pass scores, recommendations, confidence, hidden
reasoning, or arguments for inclusion to the sift.

Quiet sift uses high reasoning without tools. It starts from exclusion and
uses only the target day, exact prior-day stories, and validated candidates.
It rejects weak, speculative, sensational, narrow-interest, routine,
incremental, duplicate, stale, displaced, or merely procedural developments.
There is no quota to fill, and borderline items are rejected. The private sift
prompt owns the editorial story-count guidance and publication ceiling.
Accepted stories use only source records from their candidate. Headlines are
direct, not hooks. Aim for seven words and about 52 characters, but treat that
as editorial guidance rather than a validity boundary. Bodies usually use one
to four short paragraphs and about 240 words or fewer, with no filler. Generous
public schema limits exist only to reject runaway output.

The sift returns a private decision envelope that accounts for every candidate
exactly once as accepted or rejected. Rejection codes are:

```text
outside_target_day
insufficient_materiality
narrow_interest
incremental_update
duplicate_event
prior_day_repetition
weak_support
speculative_or_sensational
displaced_by_stronger_story
```

The generator validates the envelope, strips candidate IDs and rejection
metadata, and creates the unchanged public `stories` object. Only the sift can
create public story text.

Before changing either private prompt, its version, the model, or provider
configuration, update the private publisher repository and recheck:

- https://developers.openai.com/api/docs/models/gpt-5.6-sol
- https://developers.openai.com/api/docs/guides/latest-model
- https://developers.openai.com/api/docs/guides/structured-outputs

## Publishing and observability

The DigitalOcean `quiet-news-publisher` scheduled job runs at 4:07 a.m. and
again at 4:37 a.m. New York time. Each invocation:

1. Starts an ephemeral container from the private publisher repository.
2. Makes a depth-one checkout of public `main` and validates it.
3. Targets the completed previous New York day.
4. Exits before prompt loading, generator construction, or any OpenAI call when
   the dated file already exists.
5. Loads the exact preceding dated file as context when available.
6. Injects both private prompts in memory, then runs and validates discovery
   and quiet sift.
7. Retries only timeouts, rate limits, and provider 5xx responses once per
   stage. The maximum is two attempts per stage and four provider calls.
8. Reuses the validated in-memory candidate set when retrying quiet sift.
9. Writes the dated file, `current.json`, and `index.json` only after both
   stages succeed.
10. Validates the complete history, commits only `public/data`, and pushes
    `main`, which starts the DigitalOcean static-site deployment.

The job timeout is 20 minutes, shorter than the 30-minute gap between scheduled
invocations. A failed generation changes no remote files. A later invocation
may repeat discovery because candidates are not persisted.

The generator fails closed on invalid output, refusal, incomplete response,
malformed JSON, timeout after retry, or schema violation. Network,
authentication, billing, and other permanent request errors are not retried.

Successful runs emit one structured record per stage and one publisher record.
Stage records contain the stage, model, prompt version, response and request
IDs, token usage, web-search call count, duration, attempt count, and item
counts. Sift records also include rejection counts by code. Publisher metadata
includes total provider attempts, tokens, web-search calls, and duration.
Failure records contain only sanitized codes, stage, and attempt counts. Logs
must never contain candidate bodies, public story bodies, prompts, secrets, or
hidden reasoning.

Provider budgets, cost alerts, and other provider-side mutations require
explicit approval. Review costs through reported usage and the provider
dashboard rather than a hard-coded estimate.

## Repository map

- `public/`: static website and public JSON history
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
