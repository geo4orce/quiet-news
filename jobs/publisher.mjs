import { pathToFileURL } from "node:url";
import { generationPromptsFrom } from "../lib/generation-prompts.mjs";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { publishDailyEdition } from "../lib/publisher.mjs";

export async function runPublisherJob({ env = process.env, logger = console } = {}) {
  const store = new PublicationStore();
  let generator;
  const generate = (input) => {
    generator ||= createOpenAIGenerator({
      apiKey: env.OPENAI_API_KEY,
      prompts: generationPromptsFrom(env),
      logger
    });
    return generator(input);
  };
  const result = await publishDailyEdition({ store, generate, logger });
  logger.info?.(JSON.stringify({ event: "publisher_complete", ...result }));
  return result;
}

export function publisherFailureRecord(error) {
  return {
    event: "publisher_failed",
    code: error?.errorCode || error?.name || "Error",
    stage: error?.metadata?.stage || null,
    providerAttempts: Number.isInteger(error?.metadata?.totalProviderAttempts)
      ? error.metadata.totalProviderAttempts
      : Number.isInteger(error?.metadata?.attempts)
        ? error.metadata.attempts
        : null
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublisherJob().catch((error) => {
    console.error(JSON.stringify(publisherFailureRecord(error)));
    process.exitCode = 1;
  });
}
