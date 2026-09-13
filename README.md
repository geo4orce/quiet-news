# Quiet News

[Quiet News](https://quiet-news.com/) is an AI-powered news filter.
Each morning it shares a few things worth your attention from the previous
New York day, or simply says the day was quiet. No accounts, ads, or endless
feed. The calendar links the latest date to the homepage and older dates to
saved pages.

## Local Dev

Use Node.js 24: `npm ci`, `npm run check`, then
`npm run dev` at <http://localhost:4173/>.

The live DEV site reads published news from `main` through GitHub's public raw
file endpoint so it stays current between DEV deployments. Local development
uses the checked-out `public/data` files.

## Sources

For source stats, run `npm run sources`.
