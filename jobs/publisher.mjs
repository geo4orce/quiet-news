import pg from "pg";
import { EDITORIAL_MODEL, EDITORIAL_PROMPT_VERSION } from "../functions/lib/editorial-prompt.mjs";
import { createOpenAIGenerator } from "../functions/lib/openai-generator.mjs";
import { createPublisherHandler } from "../functions/lib/publisher.mjs";
import { createPublisherDatabase } from "../functions/lib/publisher-database.mjs";

const { Pool } = pg;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function successfulJobResult(result) {
  return result.status === "published" || result.status === "daily_limit_reached";
}

export async function runPublisherJob({
  databaseUrl = requiredEnvironment("DATABASE_URL"),
  openAIApiKey = requiredEnvironment("OPENAI_API_KEY"),
  PoolClass = Pool,
  log = console
} = {}) {
  const pool = new PoolClass({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000
  });

  try {
    const database = createPublisherDatabase({
      connect: () => pool.connect(),
      query: (text, values) => pool.query(text, values)
    });
    const generate = createOpenAIGenerator({ apiKey: openAIApiKey });
    const publish = createPublisherHandler({
      database,
      generate,
      model: EDITORIAL_MODEL,
      promptVersion: EDITORIAL_PROMPT_VERSION,
      log
    });

    const result = await publish();
    log.info(JSON.stringify({
      event: "publisher_job_finished",
      status: result.status,
      attempts: result.attempts
    }));

    if (!successfulJobResult(result)) {
      process.exitCode = 1;
    }
    return result;
  } finally {
    await pool.end();
  }
}

try {
  await runPublisherJob();
} catch {
  console.error(JSON.stringify({
    event: "publisher_job_failed",
    error_code: "startup_error"
  }));
  process.exitCode = 1;
}
