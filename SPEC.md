# Quiet News application specification

## Status and decision

Quiet News is a static, Git-backed publication. The repository is the durable
source of truth and DigitalOcean App Platform serves the `public` directory.
There is no production database, server function, proxy API, or writable
runtime filesystem.

Application repository: `https://github.com/geo4orce/quiet-news`

Production branch: `main`

Production site: `https://quiet-news.com/`

## Product

- Public responsive English-language general-news website.
- Free access with no accounts, filtering, personalization, notifications,
  advertising, or subscriptions.
- Every visitor sees the same current edition.
- Each edition contains zero to five stories.
- The publisher summarizes the completed previous `America/New_York` calendar
  day.
- Primary publication runs at 4:07 a.m. New York time, with an idempotent retry
  at 4:37 a.m.
- Repeated visits never generate content.
- The complete archive is public and can be traversed from the website or a
  future iOS or Android app.

Each visible story initially contains only `headline` and `body`. Sources are
public metadata but are not displayed initially.

## Public data contract

An edition is available at `/data/YYYY-MM-DD.json`. `/data/current.json` is an
exact copy of the current edition so an ordinary client needs no date logic or
second content request.

```json
{
  "edition_date": "2026-08-15",
  "published_at": "2026-08-16T08:07:00.000Z",
  "expires_at": "2026-08-17T09:00:00.000Z",
  "stories": [
    {
      "headline": "Story headline",
      "body": "A concise story blurb.",
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

Rules:

- `edition_date` is the completed New York calendar day being summarized.
- `published_at` and `expires_at` are canonical UTC ISO instants.
- Current editions expire at 5:00 a.m. New York time on the day after their
  expected publication day.
- `stories` contains zero to five objects.
- `headline` and `body` are required non-empty strings.
- `sources` is optional in application validation and required in generated
  model output.
- Each source has a non-empty name and absolute HTTPS URL.
- Unknown fields and partial output are rejected.

`/data/index.json` is the archive-navigation API:

```json
{
  "updated_at": "2026-08-16T08:07:00.000Z",
  "dates": ["2026-08-15", "2026-08-14"]
}
```

Dates are unique and newest first. Every date must have a matching dated file.
`current.json` must exactly equal the first matching archive file.

## Website behavior

- The default page fetches and validates `/data/current.json`.
- If it is not expired, the page renders its stories.
- If it is expired, missing, or invalid, the page says: "Today's edition could
  not be published. Please come back later."
- The website never silently presents an expired edition as current.
- Archive navigation is loaded independently from `/data/index.json` and shown
  as a compact `Today` dropdown. It opens an accessible month calendar where
  published edition dates are selectable and all other dates are disabled.
- `?date=YYYY-MM-DD` loads that dated archive and does not apply current-edition
  expiration.
- If the index request fails, the current edition remains usable.
- There is no production `?mock` mode. Initial test editions are plainly
  labeled inside their public content and can be removed after real editions
  accumulate.

The same-origin JSON URLs are suitable for the website and future native
apps. Browser CORS policy is deferred. CORS cannot prevent direct downloads by
non-browser clients and is not an access-control boundary.

## Daily publisher

GitHub Actions runs the Node.js 24 publisher at 4:07 a.m. and 4:37 a.m. in
`America/New_York`. It can also be started manually.

The publisher:

1. Computes the prior New York calendar day.
2. Stops successfully before calling OpenAI when that dated archive exists.
3. Loads `current.json` for editorial continuity when available.
4. Calls the OpenAI Responses API with web search, the version-controlled
   prompt, and strict structured output.
5. Uses `store: false` and validates the complete result locally.
6. Writes the dated archive, an exact `current.json` copy, and the updated
   `index.json`.
7. Commits only `public/data` and pushes to `main`.

One invocation makes at most three OpenAI calls. Only timeouts, rate limits,
and provider 5xx responses are retried. Workflow concurrency prevents the two
scheduled runs or a manual run from publishing concurrently. A failed workflow
does not commit partial files.

DigitalOcean detects the push to `main` and deploys the static site. GitHub is
durable storage and history; the site and native apps read from
`quiet-news.com`, not raw GitHub URLs.

## Secrets and logs

The only production secret is the GitHub Actions repository secret named
`OPENAI_API_KEY`. The browser and DigitalOcean static site have no secret.

Secrets never appear in source, tests, fixtures, logs, screenshots, workflow
artifacts, or public files. Logs may contain dates, sanitized error categories,
model metadata, token counts, and provider request IDs, but not prompts, raw
responses, full editions, or credentials.

## Release requirements

- Validate all public edition and index files before commit and during tests.
- Cover zero, one, five, and invalid six-story editions.
- Cover New York calendar boundaries and daylight-saving changes.
- Verify retry limits, permanent-error behavior, and idempotency.
- Verify current expiration and archive rendering behavior.
- Verify `current.json` matches its dated file and all indexed files exist.
- Use mocked OpenAI responses in tests. Live generation is an explicit action.
