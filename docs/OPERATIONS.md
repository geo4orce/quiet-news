# Operations and cleanup

## Hosting assumptions

- DigitalOcean App Platform
- New York region
- Static-site component only
- No database or dynamic service
- DigitalOcean's current free tier includes up to three static-only apps. Each additional static app costs $3 per month.
- Each static app includes 1 GiB of outbound transfer. Additional transfer is metered at the provider's current rate.

Pricing must be checked again before any later architecture change:

- https://docs.digitalocean.com/products/app-platform/details/pricing/
- https://docs.digitalocean.com/products/app-platform/details/availability/

## Expected failure behavior

- Missed scheduled run: keep serving the previous successful snapshot.
- Invalid or partial snapshot: reject publication.
- Hosting deployment failure: keep the last successful deployment active.
- Source outage: do not invent replacement stories or publish filler.
- Timestamp mismatch: fail validation before publication.

## Monitoring for the MVP

- Confirm the edition date and publication timestamp after the daily run.
- Alert on a missed publication, invalid artifact, or failed deployment.
- Enable DigitalOcean billing alerts where available.
- Review transfer use because billing alerts are not a hard spending cap.

## Secrets

- Store deployment and future source-provider credentials only in provider secret stores.
- Never commit real values to git, build output, logs, or the public snapshot.
- Use least-privilege tokens and rotate or revoke them after suspected exposure.

## Cleanup plan

To stop the test and prevent continuing hosting charges:

1. Record or export the last public snapshot if it should be retained.
2. Remove any custom-domain mapping, if one was later added.
3. Delete the Silent News app from DigitalOcean App Platform.
4. Remove its environment variables and secrets.
5. Revoke any deployment token used only by this app.
6. Confirm the app no longer appears in the DigitalOcean project and review the billing page for residual metered usage.
7. Keep or archive the source repository separately. Repository deletion is not required to stop App Platform billing.

