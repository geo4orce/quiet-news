# Architecture specification

## Initial shape

Silent News is a static web app on DigitalOcean App Platform in the New York region. It has no database and no always-on application service.

The website reads a versioned, published snapshot artifact. Generation and publication are separate from page requests.

## Publication contract

The canonical artifact is JSON with this conceptual structure:

```json
{
  "edition_date": "YYYY-MM-DD",
  "published_at": "ISO-8601 timestamp",
  "timezone": "America/New_York",
  "stories": []
}
```

The `stories` array contains zero to five complete story records. A future detailed schema must include headline, summary, since-yesterday text, status, and source links.

Publication must be atomic:

1. Collect and prepare a complete candidate snapshot away from the public artifact.
2. Validate its schema, story count, source links, dates, and required text.
3. Replace the public artifact only after all validation succeeds.
4. Retain the prior valid artifact if any step fails.

## Scheduling

The publisher targets 6:00 a.m. `America/New_York`, including daylight-saving transitions. Scheduling and content-generation infrastructure will be selected separately. It must not expose secrets to the browser bundle or repository.

## Deployment

- Repository branch: `main`
- Hosting component: static site only
- Region: New York (`nyc`)
- Default DigitalOcean domain initially
- Custom domain deferred
- Automatic deploys may follow successful pushes to `main`

Adding a dynamic service, worker, managed database, object storage product, dedicated egress address, or paid third-party content service requires a separate cost and risk decision.

