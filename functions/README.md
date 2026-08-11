# Quiet News Functions

This directory is a DigitalOcean Functions project for the replacement
database-backed publishing path. It is not deployed yet.

Both Functions target the DigitalOcean Node.js 24 runtime. JavaScript keeps the
application contract, tests, frontend, and serverless handlers in one language.

## Current edition

`quiet-news/current-edition` is the public, read-only `GET` Function. It returns
the newest edition created during the current `America/New_York` calendar day,
or `204 No Content` when there is none.

Allowed browser origins are:

- `https://quiet-news.com`
- `http://localhost:8000` by default

Set `LOCAL_DEV_ORIGIN` to replace the local origin. Do not add additional
production origins without updating the application contract and tests.
DigitalOcean custom `OPTIONS` handling is enabled so the platform does not add
its permissive default preflight response. Disallowed origins receive no
`Access-Control-Allow-Origin` header.

The browser calls the deployed public Function URL directly. The MVP does not
add a same-origin router, reverse proxy, or API middleman.

`DATABASE_URL` is configured at package scope because both Functions need the
database. `OPENAI_API_KEY` is configured only on the private publisher. The
public current-edition Function never receives the OpenAI credential.

`public/index.html` contains the completed direct-fetch path behind the
`quiet-news-api` meta value. That value remains empty during migration, so the
deployed page continues using its embedded snapshot. After the database and
public Function pass controlled verification, set the meta value to the exact
HTTPS Function URL to activate one fetch per non-mock page load.

## Local checks

From the repository root:

```text
npm run check
```

This runs the legacy snapshot checks, the replacement-path tests, and the
Function bundle build. Automated tests do not connect to PostgreSQL or OpenAI.

The initial schema is in `database/migrations/001_initial.sql`. Applying it to
a database or deploying this Functions project is a separate infrastructure
step and requires the cost, network, and cleanup checkpoint in the infra spec.
