# Quiet News

[Quiet News](https://quietnews.ai/) is an AI-powered news filter.
Each morning it shares a few things worth your attention from the previous
New York day, or simply says the day was quiet. No accounts, ads, or endless
feed. The calendar links the latest date to the homepage and older dates to
saved pages.

Production: [quietnews.ai](https://quietnews.ai/), branch `main`.
DEV: [quietnews.dev](https://quietnews.dev/), branch `dev`; excluded from indexing.

## Local Dev

Use Node.js 24: `npm ci`, `npm run check`, then
`npm run dev` at <http://localhost:4173/>.

`npm run dev` first
generates the site into ignored `dist/`, including every saved `/YYYY-MM-DD/`
page, then serves that output. `npm run build` regenerates it without starting
a server. After editing templates, CSS or saved content, run `npm run build`
and reload the preview. There are no new dependencies or model calls.

`public/index.html` is the shared page and story template; `public/styles.css`
styles every date. Dated JSON remains the content source of truth. Never edit
generated HTML directly. See [permanent pages](docs/permanent-pages.md) for
generation, routing and deployment behavior.

The live DEV site reads published news from `main` through GitHub's public raw
file endpoint so it stays current between DEV deployments. Local development
uses the checked-out `public/data` files.

## Sources

For source stats, run `npm run sources`.

## Images

The publisher generates optional cartoon illustrations after publishing the news.
Production, DEV and localhost display images when a matching image is available.
Images and a dated manifest are stored in public/images; news JSON remains unchanged. Failed or
uncertain image requests are never automatically resubmitted.

## Social previews

Open Graph and large-image cards use the permanent production URL and
`public/social-card.png`. The card reuses the existing Q logo and site copy.
Generated saved pages identify their own permanent production date URL and
dated title while retaining the same social card.
Regenerate it on Windows with `pwsh -File scripts/render-social-card.ps1`.
DEV retains its no-index policy; shared links identify the production site.
