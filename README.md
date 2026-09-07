# Quiet News

[Quiet News](https://quiet-news.com/) is not a conventional news aggregator.
It is an AI-powered interruption filter. Aggregators collect stories and keep
a feed full. Quiet News passes along only a few things important enough to earn
your attention, or zero on quiet days.

It is not an official channel and does not try to sound like one. There are no
accounts, feeds, ads, personalization, filler, clickbait, or endless scroll.
A quiet result is a complete answer, not a failed publication. Past days
remain available from the calendar.

## Local use

Requires Node.js 24. There are no third-party packages and no frontend build
step.

```powershell
npm ci
npm run check
npm run dev
```

Open `http://localhost:4173/`. The development server serves `public/`
directly.

## Support

geo@web-opt.com

## Generation archive

`data-raw/YYYY-MM-DD.json` contains the validated discovery candidates and
sift decisions for each saved run, including rejected candidates. Match each
`candidate_id` in `discovery.output` with `sift.output.stories` or
`sift.output.rejections` to see the decision and rejection code. A null `sift`
means that stage was not saved. These are unselected analysis records, not
published news. They are public on GitHub but outside the website's `public/`
folder. Prompts, credentials, and hidden reasoning are never included.

## License

The source code and documentation in this repository are available under the
[MIT License](LICENSE).

The MIT License does not apply to daily content under `public/data` or `data-raw`.
No license is granted to reuse or redistribute that content except as
permitted by applicable law. Source links and underlying third-party material
remain subject to their respective owners.
