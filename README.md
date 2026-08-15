# Quiet News

Quiet News is a public daily digest backed by small static JSON files in Git.
GitHub Actions generates the completed previous New York day's edition, commits
it to `main`, and DigitalOcean App Platform deploys the updated static site.

Live site: https://quiet-news.com/

## Stack

- Node.js 24 publisher and tests
- GitHub Actions scheduling and Git-backed publication history
- OpenAI Responses API with web search
- DigitalOcean App Platform static hosting
- Plain HTML, CSS, JavaScript, and JSON with no frontend build step

There is no database, persistent server, public Function, router proxy, or
runtime write path.

## Public API

```text
GET https://quiet-news.com/data/current.json
GET https://quiet-news.com/data/index.json
GET https://quiet-news.com/data/2026-08-15.json
```

The website and future native apps can use the same public contract.

## Local checks

```text
npm ci
npm run check
```

Automated tests mock OpenAI and make no live provider calls. Serve `public/`
from a local static server to test the website and archive fixtures.

## Publisher

```text
npm run job:publisher
```

The publisher requires `OPENAI_API_KEY`, targets the completed previous New York
day, and is a no-op when that dated file already exists. The normal workflow
runs at 4:07 a.m. and retries idempotently at 4:37 a.m. New York time.

See `SPEC.md` for the contract and `docs/OPERATIONS.md` for publication,
inspection, correction, and recovery procedures.
