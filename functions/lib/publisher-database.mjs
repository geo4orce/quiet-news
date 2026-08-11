const RESERVE_LOCK_SQL = `
  SELECT pg_advisory_xact_lock(
    hashtextextended('quiet-news:' || $1::text, 0)
  )
`;

export const ATTEMPT_COUNT_SQL = `
  SELECT COUNT(*)::integer AS count
  FROM generation_attempts
  WHERE attempt_day = $1::date
`;

function metadataValues(metadata = {}) {
  return [
    metadata.responseId || null,
    metadata.requestId || null,
    Number.isInteger(metadata.inputTokens) ? metadata.inputTokens : null,
    Number.isInteger(metadata.outputTokens) ? metadata.outputTokens : null,
    Number.isInteger(metadata.webSearchCalls) ? metadata.webSearchCalls : null
  ];
}

async function transaction(connect, work) {
  const client = await connect();
  let active = false;

  try {
    await client.query("BEGIN");
    active = true;
    const result = await work(client);
    await client.query("COMMIT");
    active = false;
    return result;
  } catch (error) {
    if (active) {
      try { await client.query("ROLLBACK"); } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

export function createPublisherDatabase({ connect, query }) {
  if (typeof connect !== "function" || typeof query !== "function") {
    throw new TypeError("connect and query must be functions");
  }

  return {
    async loadPriorEdition() {
      const result = await query(`
        SELECT payload
        FROM editions
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);
      return result.rows?.[0]?.payload || null;
    },

    async reserveAttempt({ attemptDay, model, promptVersion }) {
      return transaction(connect, async (client) => {
        await client.query(RESERVE_LOCK_SQL, [attemptDay]);
        const countResult = await client.query(ATTEMPT_COUNT_SQL, [attemptDay]);
        if (Number(countResult.rows?.[0]?.count || 0) >= 12) return null;

        const insertResult = await client.query(`
          INSERT INTO generation_attempts
            (attempt_day, status, model, prompt_version)
          VALUES ($1::date, 'started', $2, $3)
          RETURNING id
        `, [attemptDay, model, promptVersion]);

        return insertResult.rows[0].id;
      });
    },

    async failAttempt(attemptId, errorCode, metadata) {
      const values = metadataValues(metadata);
      const result = await query(`
        UPDATE generation_attempts
        SET status = 'failed',
            finished_at = NOW(),
            error_code = $2,
            openai_response_id = $3,
            openai_request_id = $4,
            input_tokens = $5,
            output_tokens = $6,
            web_search_calls = $7
        WHERE id = $1 AND status = 'started'
      `, [attemptId, errorCode, ...values]);
      if (result.rowCount !== 1) throw new Error("Attempt could not be marked failed");
    },

    async publishEdition(attemptId, edition, metadata) {
      return transaction(connect, async (client) => {
        const values = metadataValues(metadata);
        const updateResult = await client.query(`
          UPDATE generation_attempts
          SET status = 'succeeded',
              finished_at = NOW(),
              error_code = NULL,
              openai_response_id = $2,
              openai_request_id = $3,
              input_tokens = $4,
              output_tokens = $5,
              web_search_calls = $6
          WHERE id = $1 AND status = 'started'
          RETURNING id
        `, [attemptId, ...values]);
        if (updateResult.rowCount !== 1) {
          throw new Error("Attempt could not be marked successful");
        }

        const editionResult = await client.query(`
          INSERT INTO editions (generation_attempt_id, payload)
          VALUES ($1, $2::jsonb)
          RETURNING id, created_at
        `, [attemptId, JSON.stringify(edition)]);

        return editionResult.rows[0];
      });
    }
  };
}
