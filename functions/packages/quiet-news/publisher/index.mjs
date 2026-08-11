import pg from "pg";
import { EDITORIAL_MODEL, EDITORIAL_PROMPT_VERSION } from "../../../lib/editorial-prompt.mjs";
import { createOpenAIGenerator } from "../../../lib/openai-generator.mjs";
import { createPublisherHandler } from "../../../lib/publisher.mjs";
import { createPublisherDatabase } from "../../../lib/publisher-database.mjs";

const { Pool } = pg;
let pool;

function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000
  });
  return pool;
}

export const main = async () => {
  const currentPool = databasePool();
  const database = createPublisherDatabase({
    connect: () => currentPool.connect(),
    query: (text, values) => currentPool.query(text, values)
  });
  const generate = createOpenAIGenerator({ apiKey: process.env.OPENAI_API_KEY });
  const handler = createPublisherHandler({
    database,
    generate,
    model: EDITORIAL_MODEL,
    promptVersion: EDITORIAL_PROMPT_VERSION
  });

  return handler();
};
