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

## Daily collection and publication

Four collection runs save new facts and corrections at 06:07, 12:07, 18:07,
and 03:07 the following morning, in New York time. One independent sift
publishes the completed previous day at 04:07. The 04:37 invocation is recovery
only and reuses saved work. An already-published day makes no provider call.

Discovery warns after five minutes while polling the same background response,
with a fourteen-minute overall deadline inside the twenty-minute job. Validated
results are pushed to Git before proceeding. A hard shutdown or provider failure
can still prevent completion.

## Generation archive

New scheduled runs use the file's collection.batches and collection.sift.
Replay completed candidate additions, updates and withdrawals in batch order
to reconstruct the pool. Request checkpoints save status and timing without
prompts or complete provider responses. The archive is public on GitHub, not a
private temporary bucket. Historical runs are preserved.


`data-raw/YYYY-MM-DD.json` contains the validated discovery candidates and
sift decisions for each saved run, including rejected candidates. Match each
`candidate_id` in `discovery.output` with `sift.output.stories` or
`sift.output.rejections` to see the decision and rejection code. A null `sift`
means that stage was not saved. These are unselected analysis records, not
published news. They are public on GitHub but outside the website's `public/`
folder. Prompts, credentials, and hidden reasoning are never included.

Manually reviewed recovery runs may also contain `review.exclusions`, recording
selected candidates withheld after source checks. The original sift is retained;
apply those exclusions when comparing its selections with the published file.

## Generation timing and recovery

Run `node scripts/generation-trends.mjs` to compare saved stage timings, model,
prompt version, attempt count and available token/search usage. To include
failed scheduled runs, pass a sanitized DigitalOcean history JSONL file as its
first argument. Each line holds `startedAt` and a `records` array of structured
generation log metadata. Missing values remain unknown. The total stage time
includes retries; the last-attempt time is recorded separately by newer runs.

With an authenticated `doctl`, refresh failed-run history and write a report:

```powershell
./scripts/export-run-history.ps1
node scripts/generation-trends.mjs .cache/do-history.jsonl > .cache/generation-trends.md
```

Pass `-DoctlPath` when the CLI is not on PATH. The exporter projects known
metadata fields only and does not save full runtime logs or secrets.

An explicitly authorized manual recovery can run one completed date at a time:

```powershell
node --env-file=<local-env-file> scripts/recover-day.mjs generate YYYY-MM-DD <private-publisher-directory>
node scripts/recover-day.mjs publish YYYY-MM-DD <private-publisher-directory>
npm run check
```

Review the saved raw candidates and sift decisions between generation and
publication. The publish command writes locally; commit and push the dated
raw file and publication files together after validation. A repeated generation
command reuses validated saved work only when its date, configuration and
prior-day context match. It never overwrites an existing published day.

## License

The source code and documentation in this repository are available under the
[MIT License](LICENSE).

The MIT License does not apply to daily content under `public/data` or `data-raw`.
No license is granted to reuse or redistribute that content except as
permitted by applicable law. Source links and underlying third-party material
remain subject to their respective owners.
