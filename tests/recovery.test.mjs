import test from "node:test";
import assert from "node:assert/strict";
import { recoveryWindow } from "../scripts/recover-day.mjs";
import { createPublication } from "../lib/publication.mjs";

test("backfills retain real publication time while older days immediately expire", () => {
  const now = new Date("2026-09-12T03:00:00.000Z");
  const old = createPublication(recoveryWindow("2026-09-08", now), { stories: [] });
  assert.equal(old.published_at, now.toISOString());
  assert.ok(new Date(old.expires_at) < new Date(now.getTime() + 1000));
  const latest = recoveryWindow("2026-09-10", now);
  assert.equal(latest.expiresAt, "2026-09-12T09:00:00.000Z");
  assert.throws(() => recoveryWindow("2026-09-11", now));
  assert.throws(() => recoveryWindow("invalid", now));
});
