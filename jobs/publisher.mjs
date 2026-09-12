import { pathToFileURL } from "node:url";
import { generationPromptsFrom } from "../lib/generation-prompts.mjs";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { publishDailyEdition } from "../lib/publisher.mjs";
import { generationFailureDetails } from "../lib/generation-diagnostics.mjs";

export async function runPublisherJob({
  env = process.env, logger = console, store = new PublicationStore(),
  prepareGeneration, onGenerationStage
} = {}) {
  let generator;
  const generate = async (input) => {
    if (!generator) await prepareGeneration?.();
    generator ||= createOpenAIGenerator({
      apiKey: env.OPENAI_API_KEY,
      prompts: generationPromptsFrom(env),
      logger,
      onGenerationStage
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
    ...generationFailureDetails(error)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublisherJob().catch((error) => {
    console.error(JSON.stringify(publisherFailureRecord(error)));
    process.exitCode = 1;
  });
}
