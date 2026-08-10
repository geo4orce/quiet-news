# Operations and cleanup

## Prepare an edition

1. Set `edition_date` in `data/draft.json` to the intended New York calendar date.
2. Add zero to five fully reviewed stories.
3. Include a specific `since_yesterday` statement and at least one HTTPS source for every story.
4. Run `npm run check`.
5. Set `ready` to `true` only after editorial review.
6. Commit and push the ready draft to `main` before the publication window.

At the 6:00 a.m. New York hour, GitHub Actions validates and publishes the ready draft. It commits the resulting snapshot and the consumed `ready: false` draft to `main`. DigitalOcean then deploys the changed static artifact.

For recovery after a missed window, manually run the `Publish daily snapshot` GitHub workflow with `force` enabled. A force run still requires a valid, ready draft and never republishes an edition date already live.

## Expected failure behavior

- Draft not ready: publish nothing.
- Wrong date or New York hour: publish nothing unless an operator explicitly forces the workflow.
- Invalid or partial draft: fail validation and preserve the current snapshot.
- Duplicate edition date: publish nothing.
- GitHub Actions delay: publication may occur after 6:00 a.m.
- DigitalOcean deployment failure: the previous successful deployment remains live.
- Source outage: do not invent replacement stories or add filler.

## Monitoring

- Confirm the edition date and story count after the daily workflow.
- Confirm the DigitalOcean deployment is healthy.
- Open the public URL and verify its edition date and source links.
- Enable DigitalOcean billing alerts where available.
- Review transfer use because billing alerts are not a hard spending cap.

## Hosting assumptions

- DigitalOcean App Platform
- App: `quiet-news`
- Project: `Quiet News`
- App ID: `88ffd7c8-19c0-4c6f-9372-1564e83aa2c3`
- New York region, NYC1
- Static-site component `quiet-news` serving `public/` with no build command
- Current listed cost: $3 per month
- No database, service, environment variables, or deployment secrets

Pricing and availability references:

- https://docs.digitalocean.com/products/app-platform/details/pricing/
- https://docs.digitalocean.com/products/app-platform/details/availability/

## Secrets

- The current pipeline requires no application secrets.
- Store future provider credentials only in GitHub Actions or DigitalOcean secret stores.
- Never commit real values to git, build output, logs, or the public snapshot.
- Use least-privilege tokens and rotate or revoke them after suspected exposure.

## Cleanup plan

To stop the test and prevent continuing hosting charges:

1. Retain the final public snapshot if needed.
2. Remove any custom-domain mapping if one is later added.
3. Delete DigitalOcean app `quiet-news`, ID `88ffd7c8-19c0-4c6f-9372-1564e83aa2c3`.
4. Confirm the app no longer appears in the `Quiet News` project.
5. Delete the empty `Quiet News` project if it is no longer useful.
6. Revoke any credentials later created only for this app.
7. Review the billing page for residual metered transfer.
8. Keep or archive the GitHub repository separately. Repository deletion is not required to stop App Platform billing.
