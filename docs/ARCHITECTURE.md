# Architecture specification

## Initial shape

Silent News is a static web app on DigitalOcean App Platform in NYC1. It has no database, runtime service, or application secrets.

The public site reads a committed snapshot artifact. Generation, editorial review, publication, and page requests are separate concerns.

## Data files

- `data/draft.json` is the next candidate edition. It is never displayed publicly.
- `data/snapshot.json` is the canonical public edition.
- `scripts/snapshot.mjs` defines the validation contract shared by the browser and publishing tools.

A snapshot contains:

- Schema version
- Publication state
- Edition date and publication timestamp
- `America/New_York` timezone
- Zero to five stories
- An empty-edition explanation

Every story contains a stable ID, headline, concise summary, `Since yesterday` text, status, and one to five HTTPS source links.

## Design mock mode

The query parameter `?mock=0` through `?mock=5` bypasses the snapshot request and renders hardcoded fictional stories for layout and device testing. The page displays a persistent mock notice and adds a `noindex, nofollow` directive. Invalid mock values are ignored and load the real snapshot.

## Publication contract

Publication follows these rules:

1. The draft must pass all validation.
2. An editor must set `ready` to `true`.
3. Scheduled publication requires the draft date to match the current New York date and the New York clock to be in the 6:00 a.m. hour.
4. The publisher writes a complete temporary snapshot and renames it into place.
5. A previously published edition date is never regenerated.
6. After publication, the consumed draft is marked not ready.
7. An invalid, incomplete, early, late, or duplicate run leaves the public snapshot unchanged.

## Scheduling

GitHub Actions checks every ten minutes during both possible UTC hours corresponding to 6:00 a.m. in New York. The publisher reads New York local time, so daylight-saving changes do not require editing the workflow.

GitHub Actions and DigitalOcean deployments can start late. The MVP therefore targets the 6:00 a.m. hour but cannot guarantee a change at exactly 6:00:00. A stricter guarantee would require a dedicated scheduler and publication store.

## Deployment

- Repository: `geo4orce/silent-news`
- Branch: `main`
- DigitalOcean app: `silent-news`
- DigitalOcean project: `Silent News`
- App ID: `2b74af31-61c3-43c7-9706-cad028ec425d`
- Region: NYC1
- Component: static site only
- Automatic deploys: enabled
- Public URL: https://silent-news-29jvw.ondigitalocean.app/

Adding a dynamic service, worker, database, object storage product, dedicated egress address, news provider, or paid AI service requires a separate cost and risk decision.
