import { assertEdition } from "../../../lib/edition.mjs";
import { newYorkDay } from "../../../lib/new-york-day.mjs";

const PRODUCTION_ORIGIN = "https://quiet-news.com";
const DEFAULT_LOCAL_ORIGIN = "http://localhost:8000";

export const CURRENT_EDITION_SQL = `
  SELECT created_at, payload
  FROM editions
  WHERE created_at >= ($1::date::timestamp AT TIME ZONE 'America/New_York')
    AND created_at < ((($1::date + 1)::timestamp) AT TIME ZONE 'America/New_York')
  ORDER BY created_at DESC, id DESC
  LIMIT 1
`;

function allowedOrigins(localOrigin) {
  return new Set([PRODUCTION_ORIGIN, localOrigin].filter(Boolean));
}

function responseHeaders(origin, localOrigin) {
  const headers = {
    "Cache-Control": "no-store",
    Vary: "Origin"
  };

  if (allowedOrigins(localOrigin).has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

function preflightResponse(origin, localOrigin) {
  const headers = responseHeaders(origin, localOrigin);

  if (!headers["Access-Control-Allow-Origin"]) {
    return {
      statusCode: 403,
      headers,
      body: { error: "Origin not allowed" }
    };
  }

  return {
    statusCode: 204,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Content-Type",
      "Access-Control-Max-Age": "600"
    }
  };
}

function serializeCreatedAt(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  throw new TypeError("Edition created_at is invalid");
}

export function createCurrentEditionHandler({
  query,
  now = () => new Date(),
  localOrigin = DEFAULT_LOCAL_ORIGIN,
  log = console
}) {
  if (typeof query !== "function") throw new TypeError("query must be a function");

  return async function currentEdition(event = {}, context = {}) {
    const method = String(event.http?.method || "").toUpperCase();
    const origin = event.http?.headers?.origin;
    const headers = responseHeaders(origin, localOrigin);

    if (method === "OPTIONS") {
      return preflightResponse(origin, localOrigin);
    }

    if (method !== "GET") {
      return {
        statusCode: 405,
        headers: { ...headers, Allow: "GET, OPTIONS" },
        body: { error: "Method not allowed" }
      };
    }

    try {
      const result = await query(CURRENT_EDITION_SQL, [newYorkDay(now())]);
      const row = result.rows?.[0];

      if (!row) return { statusCode: 204, headers };

      assertEdition(row.payload);

      return {
        statusCode: 200,
        headers,
        body: {
          created_at: serializeCreatedAt(row.created_at),
          payload: row.payload
        }
      };
    } catch {
      log.error(JSON.stringify({
        event: "current_edition_failed",
        request_id: context.requestId || null,
        error_code: "database_or_data_failure"
      }));

      return {
        statusCode: 503,
        headers,
        body: { error: "Service unavailable" }
      };
    }
  };
}

let pool;

async function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");

  if (!pool) {
    const pgModule = await import("pg");
    const Pool = pgModule.default?.Pool || pgModule.Pool;
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000
    });
  }

  return pool;
}

export const main = async (event, context) => {
  const handler = createCurrentEditionHandler({
    query: async (text, values) => (await databasePool()).query(text, values),
    localOrigin: process.env.LOCAL_DEV_ORIGIN || DEFAULT_LOCAL_ORIGIN
  });

  return handler(event, context);
};
