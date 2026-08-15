# Architecture

Quiet News is a static site with a Git-backed daily publishing pipeline.

```text
GitHub Actions at 4:07 a.m. New York time
  -> OpenAI Responses API with web search
  -> validate the complete previous-day edition
  -> write public/data/YYYY-MM-DD.json
  -> replace public/data/current.json
  -> update public/data/index.json
  -> commit and push main
  -> DigitalOcean static-site deployment

Website or native app
  -> GET /data/current.json
  -> GET /data/index.json for archive navigation
  -> GET /data/YYYY-MM-DD.json for a selected archive
```

## Data ownership

The public JSON files on `main` are the production source of truth. Git gives
the small append-only dataset durable history, ordinary local inspection, and
manual correction without a database service. At one edition per day, this is
both simpler and cheaper than managed PostgreSQL, object storage plus a writer,
or a database platform.

The browser does not derive the current date. `current.json` removes the
midnight-to-publication ambiguity and provides explicit expiration behavior.
`index.json` is navigation metadata, not another content hop.

## Runtime boundaries

The static site contains no credentials. It validates JSON before rendering
and refuses to display an expired file as current. An explicitly selected dated
archive remains readable after expiration.

The GitHub Actions publisher alone receives `OPENAI_API_KEY`. It targets Node.js
24, generates once, validates, writes files in its checkout, and commits only
after the entire job succeeds.

DigitalOcean hosts immutable static output. It does not generate or persist
news, and it needs no Function component or database binding.

## Failure behavior

- A failed or invalid generation changes no production files.
- A retry run is a no-op if its dated edition already exists.
- Workflow concurrency serializes scheduled and manual publishers.
- An expired `current.json` produces an explicit publishing-error message.
- Archive navigation failure does not prevent current-edition rendering.
- DigitalOcean keeps serving the last successfully deployed static tree while
  a later build or publication fails.
