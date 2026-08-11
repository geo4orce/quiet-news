# Quiet News runtime components

The `functions` directory is the DigitalOcean Functions project for the public
database-backed read path. The private publisher runs from
`jobs/publisher.mjs` as an App Platform scheduled job. Neither component is
deployed yet.

Both components target Node.js 24. JavaScript keeps the application contract,
tests, frontend, Function handler, and scheduled job in one language.

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

`DATABASE_URL` is configured for the Function component. The scheduled job
receives `DATABASE_URL` and `OPENAI_API_KEY` as encrypted runtime variables.
The public current-edition Function never receives the OpenAI credential.

## Daily publisher

`npm run job:publisher` runs the private publisher process to completion. App
Platform schedules that command for 6:00 a.m. in `America/New_York`. The job is
not routable, exits nonzero on operational failure, and always closes its
PostgreSQL pool before the container exits.

Keeping the publisher as an App Platform job lets it share the app's managed
database trusted-source access. A standalone scheduled Function would require
broad public database access because standalone Functions do not have App
Platform's database trust relationship.

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
a database or deploying either component is a separate infrastructure step and
requires the cost, network, and cleanup checkpoint in the infra spec.
