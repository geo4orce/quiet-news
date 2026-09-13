# Quiet News

[Quiet News](https://quiet-news.com/) is an AI-powered interruption filter.
Each morning it shares a few things worth your attention from the previous
New York day, or simply says the day was quiet. No accounts, ads, or endless
feed. Past days are available through the calendar.

This repository contains the dependency-free static site, publication history,
and generation code. Private prompts and the scheduled runner live in
[quiet-news-publisher](https://github.com/geo4orce/quiet-news-publisher).
For local development, use Node.js 24: `npm ci`, `npm run check`, then
`npm run dev` at <http://localhost:4173/>. Maintenance context is in [AGENTS.md](AGENTS.md).

[MIT](LICENSE) covers code and documentation, not content in `public/data` or
`data-raw`. Contact: geo@web-opt.com.
