# Quiet News

[Quiet News](https://quiet-news.com/) is one shared, calm daily news digest.
It publishes zero to five important stories from the completed previous New
York day. There are no accounts, feeds, ads, personalization, or runtime
content generation.

The system is deliberately small:

```text
GitHub Actions at 4:07 a.m. America/New_York
  -> OpenAI Responses API with web search
  -> validate the complete edition
  -> commit public/data to main
  -> DigitalOcean deploys the static public directory

Browser
  -> /data/current.json
  -> /data/index.json for the archive calendar
  -> /data/YYYY-MM-DD.json for an archive
```

Git is the publication database, backup, and audit log. Production has no
database, server, Function, writable filesystem, or runtime secret. The only
production secret is the GitHub Actions repository secret `OPENAI_API_KEY`.

## Data contract

Every edition is stored at `public/data/YYYY-MM-DD.json`. `current.json` is an
exact copy of the current dated file. `index.json` lists every available date,
newest first.

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

- `edition_date` is the completed `America/New_York` calendar day summarized.
- `published_at` and `expires_at` are UTC ISO timestamps.
- The normal expiry is 5:00 a.m. New York time the following day.
- An edition has zero to five stories. A zero-story edition is valid.
- Headlines and bodies are non-empty. Sources use absolute HTTPS URLs.
- Unknown fields, partial output, invalid files, and stale current editions are
  rejected.

Public endpoints:

```text
https://quiet-news.com/data/current.json
https://quiet-news.com/data/index.json
https://quiet-news.com/data/YYYY-MM-DD.json
```

The default page renders `current.json`. `?date=YYYY-MM-DD` renders an archive
without applying current-edition expiry. The archive calendar enables only
dates present in `index.json`. If current content is missing, invalid, or
expired, the site shows a publication error instead of stale news.

## Daily publication

`.github/workflows/publish-daily.yml` runs at 4:07 a.m. and retries at 4:37
a.m. New York time. It can also be run manually in GitHub Actions.

Each invocation:

1. Targets the completed previous New York day.
2. Exits successfully without an OpenAI call if its dated file already exists.
3. Uses the prior edition as editorial context when available.
4. Calls the Responses API with web search, `store: false`, and strict output.
5. Retries only timeouts, rate limits, and provider 5xx errors, at most three
   calls total.
6. Validates and writes the dated file, `current.json`, and `index.json`.
7. Commits only `public/data` and pushes `main`.

The two schedules share a concurrency group, so publication is serialized.
A failed generation changes no files. A successful push automatically starts
a DigitalOcean static-site deployment.

## Contributing and local use

Requires Node.js 24. There are no third-party packages or frontend build step.

```powershell
npm ci
npm run check
npx --yes serve public --listen 4173
```

Open `http://localhost:4173/` or an archive such as
`http://localhost:4173/?date=2026-08-14`. Tests mock OpenAI and make no live
provider calls.

To correct published news manually:

1. Edit the dated file in `public/data`.
2. If it is current, make the identical edit to `current.json`.
3. Update `index.json` only when adding or removing an archive date.
4. Run `npm run check`.
5. Commit and push the reviewed files as a normal forward change.

Do not delete an existing dated file merely to force regeneration. Never paste
or print `OPENAI_API_KEY`. Rotate the OpenAI credential and replace the GitHub
secret if exposure is suspected.

## Repository map

- `public/`: the complete static website and public JSON archive
- `jobs/`: the GitHub Actions publisher entry point
- `lib/`: validation, New York date logic, OpenAI generation, and file storage
- `scripts/`: whole-archive validation
- `tests/`: Node test suite with provider mocks
- `.github/workflows/`: publication schedule and commit automation
- `AGENTS.md`: maintainer context for coding agents

DigitalOcean resource identities and provider configuration are maintained in
the separate `geo4orce/infra` repository. Application behavior, editorial
logic, public data, and tests remain here.
