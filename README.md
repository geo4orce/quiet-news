# Silent News

Silent News is a standalone, public web app that publishes one shared daily news snapshot. The snapshot is published once at 6:00 a.m. in the `America/New_York` timezone and remains unchanged until the next successful publication.

## MVP

- English only
- Zero to five stories per day
- No accounts, filters, personalization, customization, ads, or subscriptions
- A visible explanation of what changed since yesterday
- Responsive web app only
- One production branch: `main`

Planning documents live in [`docs/`](docs/). Product implementation follows the contracts in those documents.

## Repository policy

- Never commit credentials, tokens, source-provider keys, or generated private data.
- Production deploys from `main`.
- The published snapshot is immutable during the day. A page visit never triggers generation.

