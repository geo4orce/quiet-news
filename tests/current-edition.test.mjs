import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createCurrentEditionHandler,
  CURRENT_EDITION_SQL
} from "../functions/packages/quiet-news/current-edition/index.mjs";

const projectConfiguration = await readFile(
  new URL("../functions/project.yml", import.meta.url),
  "utf8"
);

const edition = {
  stories: [{ headline: "A headline", body: "A concise body." }]
};

function request(method = "GET", origin = "https://quiet-news.com") {
  return { http: { method, headers: { origin } } };
}

function silentLog() {
  return { error() {} };
}

test("exposes the read Function with provider preflight overrides", () => {
  assert.match(
    projectConfiguration,
    /name: current-edition[\s\S]*?web: true[\s\S]*?web-custom-options: true/
  );
});

test("returns the newest valid edition created on the current New York day", async () => {
  const calls = [];
  const handler = createCurrentEditionHandler({
    query: async (text, values) => {
      calls.push({ text, values });
      return {
        rows: [{ created_at: new Date("2026-08-11T12:30:00Z"), payload: edition }]
      };
    },
    now: () => new Date("2026-08-11T13:00:00Z"),
    log: silentLog()
  });

  const response = await handler(request());

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    created_at: "2026-08-11T12:30:00.000Z",
    payload: edition
  });
  assert.equal(response.headers["Access-Control-Allow-Origin"], "https://quiet-news.com");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(calls[0].values, ["2026-08-11"]);
  assert.match(calls[0].text, /ORDER BY created_at DESC, id DESC/);
  assert.equal(calls[0].text, CURRENT_EDITION_SQL);
});

test("returns 204 when there is no edition today", async () => {
  const handler = createCurrentEditionHandler({
    query: async () => ({ rows: [] }),
    log: silentLog()
  });
  const response = await handler(request());
  assert.equal(response.statusCode, 204);
  assert.equal("body" in response, false);
});

test("returns a generic 503 on database failure", async () => {
  const entries = [];
  const handler = createCurrentEditionHandler({
    query: async () => { throw new Error("postgresql://private"); },
    log: { error: (entry) => entries.push(entry) }
  });
  const response = await handler(request());
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { error: "Service unavailable" });
  assert.doesNotMatch(entries.join("\n"), /postgresql|private/);
});

test("does not return an invalid stored payload", async () => {
  const handler = createCurrentEditionHandler({
    query: async () => ({
      rows: [{ created_at: "2026-08-11T12:00:00Z", payload: { stories: [], extra: true } }]
    }),
    log: silentLog()
  });
  const response = await handler(request());
  assert.equal(response.statusCode, 503);
});

test("handles methods before touching the database", async () => {
  let queried = false;
  const handler = createCurrentEditionHandler({
    query: async () => { queried = true; return { rows: [] }; },
    log: silentLog()
  });
  const response = await handler(request("POST"));
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, "GET, OPTIONS");
  assert.equal(queried, false);
});

test("handles CORS preflight only for an allowed website origin", async () => {
  let queried = false;
  const handler = createCurrentEditionHandler({
    query: async () => { queried = true; return { rows: [] }; },
    log: silentLog()
  });

  const allowed = await handler(request("OPTIONS", "https://quiet-news.com"));
  const denied = await handler(request("OPTIONS", "https://example.com"));

  assert.equal(allowed.statusCode, 204);
  assert.equal(
    allowed.headers["Access-Control-Allow-Origin"],
    "https://quiet-news.com"
  );
  assert.equal(allowed.headers["Access-Control-Allow-Methods"], "GET, OPTIONS");
  assert.equal(allowed.headers["Access-Control-Max-Age"], "600");
  assert.equal(denied.statusCode, 403);
  assert.equal("Access-Control-Allow-Origin" in denied.headers, false);
  assert.equal(queried, false);
});

test("allows only the production and configured local CORS origins", async () => {
  const handler = createCurrentEditionHandler({
    query: async () => ({ rows: [] }),
    localOrigin: "http://localhost:4173",
    log: silentLog()
  });

  const local = await handler(request("GET", "http://localhost:4173"));
  const denied = await handler(request("GET", "https://example.com"));
  const noOrigin = await handler({ http: { method: "GET", headers: {} } });

  assert.equal(local.headers["Access-Control-Allow-Origin"], "http://localhost:4173");
  assert.equal("Access-Control-Allow-Origin" in denied.headers, false);
  assert.equal("Access-Control-Allow-Origin" in noOrigin.headers, false);
});
