# Quiet News

Quiet News is a standalone public web app that publishes one shared daily news snapshot. The snapshot targets 6:00 a.m. in the `America/New_York` timezone and remains unchanged until the next successful publication.

Live site: https://quiet-news.com/

## MVP

- English only
- Zero to five stories per day
- No accounts, filters, personalization, customization, ads, or subscriptions
- A visible explanation of what changed since yesterday
- Responsive web app only
- One production branch: `main`

## Daily publishing

The public site is the self-contained `public/index.html`: markup, styles, scripts, mock stories, favicon, and the current snapshot are all embedded in that one file. It has no frontend imports and requires no build or compilation step.

Editors prepare `data/draft.json` and explicitly set `ready` to `true` only after review. The scheduled workflow validates the draft, publishes it once during the 6:00 a.m. New York hour, embeds the immutable snapshot in `public/index.html`, commits both artifacts to `main`, and lets DigitalOcean deploy that commit.

The initial pipeline is deliberately provider-neutral. It does not collect news or call a paid AI API.

## Local checks

Node.js 22 or newer is recommended.

```text
npm run check
```

`npm run publish` force-publishes a ready draft outside the normal time window. Use it only for an intentional recovery or preview.

For a local preview, serve the `public/` directory with any static file server. Opening the HTML directly also works for basic layout checks.

## Layout testing

Add `?mock=0` through `?mock=5` to any deployed or local URL to bypass the real snapshot and render that many fictional stories. Mock mode is visibly labeled and adds a `noindex` directive.

Examples:

- `/?mock=0` tests the empty edition.
- `/?mock=3` tests a typical edition.
- `/?mock=5` tests the maximum-length edition.

Any other `mock` value is ignored and the real snapshot loads normally.

## Repository policy

- Never commit credentials, tokens, source-provider keys, or generated private data.
- Production deploys from `main`.
- A page visit never triggers content generation or publication.
- An invalid or incomplete draft cannot replace the latest valid snapshot.

Planning and operating documents live in `docs/`.
