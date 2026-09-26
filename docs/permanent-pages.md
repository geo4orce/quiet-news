# Permanent saved days

## Generation and deployment

Saved pages use `/YYYY-MM-DD/`, with the date taken from `edition_date`.
App Platform builds with Node.js 24 from the repository root, runs the checks
and generator, and serves only `dist/`. Production deploys `main`; DEV deploys
`dev` with `--noindex`. The exact hosting specifications belong in infra.
Publication and image commits on main automatically rebuild the complete archive.
No publisher changes or provider calls are needed. Failed builds leave the
previous live deployment in place.

Run `npm run dev` to generate and serve the site at `http://localhost:4173/`.
Run `npm run build` to refresh the generated output while the preview is running.
Reload the browser after changes. `npm run build -- --noindex` marks every HTML
page noindex and disallows crawling, for deployment previews.

## What is static

| Page or feature | Behavior |
| --- | --- |
| Production saved date | Complete news, source links, metadata and available image markup in initial HTML; no JavaScript needed to read the news. |
| Production homepage | JavaScript fetches and validates current JSON, including expiry. Initial HTML has no news. |
| Calendar | JavaScript loads the date index and creates navigation links after setup. |
| Hosted legacy `?date=` link | JavaScript redirects to the clean date path. |
| DEV news | JavaScript refreshes data from public main; generated date HTML is a preview snapshot. |

Production saved pages return HTTP 200, allow crawling and indexing, identify
their own canonical URLs, and are discoverable through the sitemap advertised
in robots.txt. This establishes technical eligibility, not evidence that Google
has crawled or indexed them. Search Console inspection remains a follow-up.
See [Google's technical requirements](https://developers.google.com/search/docs/essentials/technical).

The website still uses JavaScript, but saved production news does not depend on
it. Lazy image loading is the browser fetching static files; it does not fetch
or generate story text. Without JavaScript, the sitemap provides archive
discovery for crawlers; the page itself has no archive navigation links.

## Content and presentation

- `public/data` remains the sole source of saved news. Rendering never calls a
  model, changes stories, regenerates images or writes to publication storage.
- `public/index.html` contains the common page layout and story template.
  Keep its data attributes and comment slots when changing the layout. The slots
  are `saved-day-heading`, `saved-stories`, `story-headline`, `story-body`,
  `story-sources` and `story-image`. The renderer fills them with escaped content;
  wrappers, extra classes, attribute order and quote style can change independently.
  Missing or duplicate slots and missing browser data attributes fail the build,
  including on quiet days, instead of producing incomplete pages.
- All pages link to the same `public/styles.css`. Change fonts, colors or spacing
  there. Structural changes belong in the shared template and, where its slots
  change, the renderer. Rebuilding applies them to every historical date.
- `dist/` is disposable output, excluded from Git. All data is validated and all
  pages rendered before staging a new output directory. A failed validation or
  render leaves the previous output intact; replacement failure attempts rollback.
- Quiet days have real pages showing `Quiet.`. Corrections use the same date URL.
  Source attribution, full body text and available matching images are in initial
  HTML. Image failure remains optional; hash matching rejects images for changed
  story content. The original September 11 illustrations remain supported.
- The date and full stories remain visible without JavaScript. The bottom
  earlier/Today/later row has been removed; archive navigation uses the calendar.
  Calendar controls appear only after successful setup. Production JavaScript enhances saved
  pages without clearing or refetching their already validated story HTML.

## Routing, metadata and freshness

- Each saved day has a dated title/description, its own production canonical and
  social URL, and the existing permanent social card.
- The generated sitemap includes `/` and every saved date in `data/index.json`.
  This publication index does not track search-engine indexing. The sitemap omits
  `lastmod`: the contract has no reliable correction timestamp, and rebuild time
  must not masquerade as a news update.
- The homepage still loads current JSON with its existing expiry check. Its
  initial HTML does not embed current stories. Homepage prerendering and no-JS
  freshness are separate work. The homepage retains its own canonical. Sitemap
  entries expose every date to crawlers; calendar links are added by JavaScript.
  Without JavaScript, saved pages remain readable but have no archive navigator.
- The calendar retains its latest-day link to `/`. Earlier dates use clean paths.
  Every dated page, including the latest, offers `Today` back to `/`.
- The local server issues HTTP 308 redirects for valid `?date=` links, slashless
  date paths and explicit dated `index.html` paths. Unrelated query parameters
  survive. On static hosting the browser provides old-query compatibility using
  `location.replace`; this is not a server redirect and requires JavaScript.
- Missing or malformed paths return local HTTP 404 with `Unavailable.`; valid
  current/future dates show `Not yet.`. Error pages are noindex and never show
  the current stories. A static host's generic 404 uses `Unavailable.` initially;
  JavaScript distinguishes current/future dates. Invalid date parameters on `/`
  are removed as before.

## Accessibility and loading

The reading styles target WCAG AAA text contrast (at least 7:1), including
source/footer text, calendar weekday labels, and active teal controls. This is
not a claim of full AA or AAA conformance. Full keyboard, screen-reader, reflow,
target-size and content audits remain separate work. Saved dates use an h1,
followed by story h2 headings; a skip link bypasses navigation. The calendar uses
native links and buttons within a labelled group, not incomplete ARIA grid roles.

Saved news is present in the initial HTML. Illustrations use native lazy loading,
low fetch priority, async decoding and reserved dimensions. The enhancement
module is at the end of the document, with low fetch priority on saved pages;
calendar setup waits for a rendering opportunity. Current news validation remains
essential JavaScript on the homepage, and now precedes calendar loading. The
calendar stays hidden until its event handlers and date links are ready. Native
source links are usable immediately and do not wait for scripts.
The small shared stylesheet intentionally loads early to preserve readable contrast,
hide inactive states and avoid unstable unstyled layouts. Download priorities
are browser hints, not a strict serial request order; images never gate the news.

## DEV and known limits

DEV refreshes dated content, the homepage and calendar from public main with the
existing validation checks. Its generated HTML is the dev checkout snapshot.
Dates published since the last dev deployment use the noindex `404.html` shell
and load their validated news with JavaScript. That preview response remains
HTTP 404; without JavaScript it says `Unavailable.`. Production generates every
published date and has no such dependency. Existing DEV pages may display their
snapshot briefly before refreshing. Invalid index/data shows `Error.`.

Both hosts use `404.html` as the error document, with no homepage catchall.
Production saved pages work without JavaScript. Legacy query links still require
JavaScript on static hosting; a query-aware server redirect would need separate
hosting work. Current/future missing paths initially show `Unavailable.` and
switch to `Not yet.` with JavaScript.

Full accessibility certification, homepage prerendering, correction timestamps,
and Search Console inspection remain separate work. Google may choose its own
canonical for overlapping homepage/latest-date content. Sitemap eligibility does
not guarantee indexing.
