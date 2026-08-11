import { assertEdition, EditionValidationError } from "./edition.mjs";
import { GenerationError } from "./openai-generator.mjs";
import { newYorkDay } from "./new-york-day.mjs";

const MAX_INVOCATION_ATTEMPTS = 3;

function sanitizedError(error) {
  if (error instanceof GenerationError) return error;
  if (error instanceof EditionValidationError) {
    return new GenerationError("validation_error", false);
  }
  return new GenerationError("internal_error", false);
}

function retryDelay(attemptNumber, random) {
  return (250 * (2 ** (attemptNumber - 1))) + Math.floor(random() * 100);
}

function logEntry(log, value) {
  log.info(JSON.stringify(value));
}

export function createPublisherHandler({
  database,
  generate,
  model,
  promptVersion,
  now = () => new Date(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  random = Math.random,
  log = console
}) {
  return async function publish() {
    const startedAt = Date.now();
    const attemptDay = newYorkDay(now());
    let priorEdition;

    try {
      priorEdition = await database.loadPriorEdition();
      if (priorEdition !== null) assertEdition(priorEdition);
    } catch {
      logEntry(log, {
        event: "publication_failed",
        attempt_day: attemptDay,
        error_code: "database_error",
        elapsed_ms: Date.now() - startedAt
      });
      return { status: "failed", attempts: 0, error_code: "database_error" };
    }

    for (let number = 1; number <= MAX_INVOCATION_ATTEMPTS; number += 1) {
      let attemptId;
      try {
        attemptId = await database.reserveAttempt({ attemptDay, model, promptVersion });
      } catch {
        return { status: "failed", attempts: number - 1, error_code: "database_error" };
      }

      if (attemptId === null) {
        logEntry(log, {
          event: "publication_stopped",
          attempt_day: attemptDay,
          error_code: "daily_limit_reached",
          elapsed_ms: Date.now() - startedAt
        });
        return { status: "daily_limit_reached", attempts: number - 1 };
      }

      let generated;
      try {
        generated = await generate({ attemptDay, priorEdition });
        assertEdition(generated.edition);
      } catch (error) {
        const failure = sanitizedError(error);
        try {
          await database.failAttempt(attemptId, failure.errorCode, failure.metadata);
        } catch {
          return { status: "failed", attempts: number, error_code: "database_error" };
        }

        if (failure.retryable && number < MAX_INVOCATION_ATTEMPTS) {
          await sleep(retryDelay(number, random));
          continue;
        }

        logEntry(log, {
          event: "publication_failed",
          attempt_id: attemptId,
          attempt_day: attemptDay,
          model,
          prompt_version: promptVersion,
          error_code: failure.errorCode,
          openai_response_id: failure.metadata.responseId || null,
          openai_request_id: failure.metadata.requestId || null,
          elapsed_ms: Date.now() - startedAt
        });
        return { status: "failed", attempts: number, error_code: failure.errorCode };
      }

      try {
        const published = await database.publishEdition(
          attemptId,
          generated.edition,
          generated.metadata
        );
        const storyCount = generated.edition.stories.length;

        logEntry(log, {
          event: "publication_succeeded",
          attempt_id: attemptId,
          edition_id: published.id,
          attempt_day: attemptDay,
          model,
          prompt_version: promptVersion,
          openai_response_id: generated.metadata.responseId || null,
          openai_request_id: generated.metadata.requestId || null,
          input_tokens: generated.metadata.inputTokens,
          output_tokens: generated.metadata.outputTokens,
          web_search_calls: generated.metadata.webSearchCalls,
          story_count: storyCount,
          elapsed_ms: Date.now() - startedAt
        });

        return {
          status: "published",
          attempts: number,
          attempt_id: attemptId,
          edition_id: published.id,
          story_count: storyCount
        };
      } catch {
        try {
          await database.failAttempt(attemptId, "database_error", generated.metadata);
        } catch {}
        return { status: "failed", attempts: number, error_code: "database_error" };
      }
    }

    return { status: "failed", attempts: MAX_INVOCATION_ATTEMPTS, error_code: "internal_error" };
  };
}
