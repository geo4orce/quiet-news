# Quiet News application specification

## Status

The product and replacement publishing architecture are confirmed. OpenAI API
connectivity has been verified with one successful minimal request. Local
implementation may begin. Provider provisioning remains gated by the
corresponding infrastructure task.

The repository already contains a working static prototype and a local
draft-to-HTML publishing pipeline. Preserve that code until the replacement
database and Functions path is implemented and tested. Do not overwrite
unrelated local changes.

## Cross-repository ownership

This file is the source of truth for application behavior, interfaces, data
validation, prompts, code layout, and tests.

Infrastructure details belong in:

`C:\Users\geoar\Code\infra\tasks\Silent news prototype\SPEC.md`

The infrastructure task is the source of truth for DigitalOcean resource IDs,
regions, plans, pricing, network access, deployed secret names, operational
risk, and cleanup.

Coordination checkpoint:

- Last aligned: 2026-08-10
- Application repository: `https://github.com/geo4orce/quiet-news`
- Infrastructure repository: `C:\Users\geoar\Code\infra`
- Production branch in both repositories: `main`
- DEV deployment: none

## Product

- Public responsive website only for the MVP.
- English-language general news.
- Free access.
- No accounts, filtering, personalization, customization, notifications, ads,
  or subscriptions.
- Every visitor sees the same published edition.
- Each edition contains zero to five stories.
- Publishing targets 6:00 a.m. in `America/New_York`, following daylight-saving
  changes.
- Repeated visits never trigger generation and return the same stored edition.
- A newer successful publication on the same New York day wins immediately.
- If no edition exists today, the site shows its empty state.

## Visible page

The visible page contains only:

1. A small Quiet News header.
2. Zero to five stories.
3. A small footer.

Each visible story contains:

- `headline`
- `body`

Sources are stored as optional metadata but are not displayed initially.

The footer includes a concise informational disclaimer stating that Quiet News
is not an official source and should not be relied on as one. It credits
`web-opt.com LLC` as the creator.

Keep `public/index.html` self-contained, with its markup, CSS, JavaScript,
wordmark, and icon in one file. Do not introduce a frontend build, imports, or
compilation unless a later requirement clearly needs them.

## Mock layout mode

- Preserve `?mock=0` through `?mock=5`.
- A valid mock value bypasses the live current-edition request.
- It renders exactly the requested number of deterministic fictional stories.
- Mock mode is visibly labeled and adds `noindex, nofollow`.
- Invalid mock values are ignored and load the live edition normally.
- Mock mode never calls OpenAI or PostgreSQL.

## Edition contract

The generated, stored, and returned payload is:

```json
{
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

Validation rules:

- `stories` is required and is an array of zero to five objects.
- `headline` is a required non-empty string.
- `body` is a required non-empty string.
- `body` is a concise story blurb. A yesterday/today comparison is not required.
- `sources` is optional.
- When present, `sources` is an array of objects with a non-empty `name` and an
  absolute HTTPS `url`.
- Unknown fields are rejected in the model output contract.
- Invalid or partial output is never published.

The initial payload does not contain edition date, timezone, schema version,
checksum, status, stable story ID, summary, or `since_yesterday` fields.

## Application components

### Static frontend

- File: `public/index.html`
- Fetch the public current-edition endpoint once per page load.
- Render only the validated response.
- Treat `204 No Content` as the empty state.
- On request failure, show a quiet unavailable state without generating content
  or exposing diagnostic details.
- Do not place provider keys, database credentials, or private endpoints in the
  HTML.

### Current-edition Function

- Public read-only HTTP Function.
- Application method: `GET` only. `OPTIONS` is handled only for browser CORS
  preflight.
- The static website calls the deployed Function URL directly. The MVP does not
  add a same-origin router or proxy.
- Query PostgreSQL for the newest edition created during the current New York
  calendar day.
- Return `200 OK` with `created_at` and `payload` when found.
- Return `204 No Content` when no edition exists today.
- Return a generic `500` or `503` response on an operational failure.
- Allow CORS only for `https://quiet-news.com` and the documented local
  development origin.
- Override the provider's default preflight behavior and return CORS headers
  only for those allowed origins.
- Never call OpenAI.

### Daily publisher job

- Private App Platform scheduled job invoked at 6:00 a.m. in
  `America/New_York`.
- Runs `npm run job:publisher` to completion and is not routable.
- Shares the App Platform app's managed-database trusted-source access with the
  public Function, avoiding broad public database ingress.
- Calculate the current New York calendar day.
- Reserve a generation-attempt row before every OpenAI call.
- Load the newest prior edition when available.
- Call the OpenAI Responses API with web search, the prior edition, the
  version-controlled editorial prompt, and a strict structured-output schema.
- Use `store: false`.
- Validate the output locally.
- Insert the edition and mark the attempt successful in one database
  transaction.
- A valid zero-story edition is publishable.
- A failed attempt creates no edition.

### Editorial prompt

- Store the production prompt in the application repository.
- Give each intentional prompt revision a short human-readable version.
- Require English output, zero to five stories, concise blurbs, source metadata,
  and valid JSON matching the edition contract.
- Include the newest prior edition only as context for consistency and avoiding
  unnecessary repetition.
- Do not rely on ChatGPT, Codex tasks, or OpenAI response storage as memory.

## Attempt and retry safety

- Normal scheduled execution makes one OpenAI generation attempt.
- One Function invocation may make no more than three total attempts.
- The hard ceiling is 12 OpenAI generation attempts per New York calendar day.
- The daily limit is enforced in PostgreSQL before an API call, not only in
  process memory.
- Count started, failed, and successful calls toward the ceiling.
- Retry only transient timeouts, rate limits, and provider 5xx errors.
- Do not retry authentication, billing, local validation, or malformed-output
  errors indefinitely.
- Use short exponential backoff with jitter.
- Stop after the first successful publication.
- Apply a strict timeout to every provider call.

## Database interface

The provider-neutral application expects two PostgreSQL tables:

- `generation_attempts`: metadata-only attempt ledger and daily circuit breaker.
- `editions`: immutable published payloads linked to successful attempts.

The exact migration SQL and provider setup are coordinated with the
infrastructure task. Application code must not mutate an existing edition.

## Secrets and local configuration

Names only:

- `OPENAI_API_KEY`
- `DATABASE_URL`

Rules:

- `.env` remains ignored by Git.
- `.env.example` contains placeholders only.
- No secret appears in source, tests, fixtures, prompts, logs, screenshots, or
  public build artifacts.
- Deployed secrets live in encrypted DigitalOcean component settings.
- The static frontend receives no secret.

## Logging and audit

Store or log only what is needed to operate and audit published editions:

- Attempt ID and status.
- Edition ID when successful.
- New York attempt day.
- Model and prompt version.
- OpenAI response and request identifiers when available.
- Input/output token counts and web-search call count.
- Story count, elapsed time, and sanitized error category.

Do not retain or log full prompts, raw responses, complete payloads, database
URLs, API keys, or detailed provider error bodies.

## Existing files to retire after replacement verification

The current prototype uses `data/draft.json`, `data/snapshot.json`, embedded
snapshot data in `public/index.html`, local publishing scripts, and a GitHub
Actions publication workflow. These are legacy implementation details after the
database-backed path is live.

Do not remove them until:

1. The new schema and Functions pass local tests.
2. The public GET Function is verified against PostgreSQL.
3. The frontend fetch path and mock modes are verified.
4. The scheduled publisher completes a controlled test publication.
5. The cleanup is reviewed as a separate focused change.

Update or replace the existing `README.md` and `docs/` files during that
migration so they do not describe the retired embedded-snapshot pipeline.

## Test requirements

- Accept zero, one, and five valid stories.
- Reject six stories.
- Reject missing or empty headline/body fields.
- Accept omitted sources.
- Reject invalid source metadata and non-HTTPS URLs.
- Reject unknown model-output fields.
- Verify newest-publication-wins behavior.
- Verify New York day boundaries, including daylight-saving transitions.
- Verify three-attempt invocation limit and 12-attempt daily circuit breaker.
- Verify crashed `started` attempts count toward the daily limit.
- Verify retry classification and backoff without live provider calls.
- Verify `GET` success, empty, database failure, CORS, and method handling.
- Verify `?mock=0` through `?mock=5` bypass the API.
- Verify no secret is present in tracked or public files.

Use mocks for automated OpenAI tests. Live API calls are manual smoke tests and
must be deliberately authorized.

## API smoke-test results

Two separately authorized `gpt-5.6-luna` Responses API smoke tests were made on
2026-08-10 without web search:

1. The first returned HTTP `429`. No automatic retry was made.
2. After API balance was added, the second succeeded and returned exactly
   `Quiet News API works.`

Successful test metadata:

- Response ID: `resp_03b92fed8375df39016a7a96e98200819d9fa77d051951a956`
- Request ID: `req_130a0f8f43fb4ae2b97b607a8b606913`
- Input tokens: 19
- Output tokens: 9
- Total tokens: 28
- Stored response state requested: no

This verifies the local key, API project balance, model access, and basic
Responses API connectivity. Production project spend controls still require
confirmation before deployment.

## Implementation sequence

- [x] Record confirmed application decisions in this specification.
- [x] Preserve existing local changes and legacy pipeline during migration.
- [x] Record the initial HTTP `429` smoke-test result without automatic retry.
- [x] Add API balance and complete one successful minimal OpenAI API smoke test.
- [x] Add database migration and shared edition validation.
- [x] Implement the current-edition Function and its tests.
- [x] Implement the publisher as an App Platform scheduled job without live
  calls in automated tests.
- [x] Add the versioned editorial prompt and strict output schema.
- [x] Update `public/index.html` to fetch the current edition while preserving
  mock modes and the one-file frontend.
- [x] Run all local validation and tests.
- [ ] Complete the infrastructure cost/network/cleanup checkpoint.
- [ ] Provision and deploy only after that checkpoint.
- [ ] Perform controlled production verification.
- [ ] Retire the embedded-snapshot pipeline in a separate reviewed change.
