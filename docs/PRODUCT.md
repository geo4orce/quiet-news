# Product specification

## Product statement

Silent News gives every visitor the same concise view of the day's most important news and makes the change from yesterday explicit.

## MVP audience and scope

- Public, English-language general news for a United States audience
- Responsive website only
- Free access
- No login, filtering, personalization, customization, notifications, ads, or subscriptions

## Daily snapshot

- Publish once each day at 6:00 a.m. in `America/New_York`.
- Daylight-saving changes follow New York local time.
- Publish between zero and five stories.
- Serve the exact same published snapshot to every visitor until the next successful publication.
- Never generate or rewrite content because someone visits or refreshes the site.
- If a scheduled publication fails, keep serving the last successfully published snapshot and display its publication time accurately.

## Story presentation

Each story contains:

1. Headline
2. Concise two-sentence summary
3. A `Since yesterday` sentence
4. One status: `New`, `Developing`, or `No material change`
5. Links to supporting sources

`Since yesterday` means the visible product explains the material factual change since the prior published snapshot. It is not a side-by-side replay of both full editions.

When no story meets the editorial threshold, the snapshot contains zero stories and a plain explanation that no items were selected. The system must not add filler to reach a quota.

## Naming and identity

- Working name: Silent News
- MVP identity: text wordmark and simple app/favicon mark
- A final name, custom logo, domain purchase, and trademark review are deferred

## Success criteria

- A visitor can understand the day's selected news in a few minutes.
- Refreshing or revisiting during the day returns the same snapshot.
- The change from yesterday is clear without opening yesterday's full edition.
- A failed publishing run cannot replace a valid snapshot with partial output.

