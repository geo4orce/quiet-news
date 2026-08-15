# Operations

## Production resources

- Site: `https://quiet-news.com/`
- Repository: `https://github.com/geo4orce/quiet-news`
- Production branch: `main`
- DigitalOcean App Platform app: `quiet-news`
- App ID: `88ffd7c8-19c0-4c6f-9372-1564e83aa2c3`
- Publication workflow: `.github/workflows/publish-daily.yml`
- Required repository secret: `OPENAI_API_KEY`

There is no production database or public Function endpoint.

## Viewing and editing data

Clone or pull the repository and inspect `public/data`. Each dated file is a
complete edition. `current.json` is an exact copy of the newest current archive,
and `index.json` contains the archive dates in descending order.

To make a controlled manual correction:

1. Edit the dated archive.
2. If it is current, make the identical edit to `current.json`.
3. Keep `index.json` consistent with the available dated files.
4. Run `npm run check`.
5. Commit and push the reviewed files.

Changing Git history is unnecessary. Corrections should be normal forward
commits so their audit trail remains visible.

## Daily publication

GitHub Actions schedules two idempotent invocations:

- 4:07 a.m. `America/New_York`: primary run
- 4:37 a.m. `America/New_York`: retry if the primary did not publish

Both run the same command, `npm run job:publisher`. If that New York edition
date already exists, the command exits successfully without an OpenAI call or
file change.

The workflow may be manually dispatched from GitHub Actions. A manual run uses
the current clock, so it targets the completed prior New York day. Do not delete
an existing dated file merely to force regeneration without reviewing the
consequences.

## Verification

After publication:

1. Confirm the GitHub Actions run succeeded and committed one dated file plus
   `current.json` and `index.json`.
2. Confirm the DigitalOcean deployment for that commit succeeded.
3. Request `/data/current.json` and verify `edition_date` and `expires_at`.
4. Request the matching `/data/YYYY-MM-DD.json` and verify it is identical.
5. Open the website and its archive link.

If publication fails before 5:00 a.m., the previous current edition can still
render until its explicit expiration. At and after expiration, the website
shows the publishing-error state until a valid replacement is deployed.

## Recovery

Git is the backup and audit log. Restore a broken public file with a new commit
based on a known-good earlier version, then run the checks and push. A previous
DigitalOcean deployment can provide temporary hosting rollback, but the source
files on `main` should still be corrected promptly.

Never paste or print `OPENAI_API_KEY`. Rotate it in OpenAI and replace the
GitHub repository secret after suspected exposure.
