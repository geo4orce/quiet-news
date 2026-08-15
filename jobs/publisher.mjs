import { pathToFileURL } from "node:url";
import { createOpenAIGenerator } from "../lib/openai-generator.mjs";
import { PublicationStore } from "../lib/publication-store.mjs";
import { publishDailyEdition } from "../lib/publisher.mjs";

export async function runPublisherJob({ env = process.env, logger = console } = {}) {
  const store = new PublicationStore();
  const generate = createOpenAIGenerator({ apiKey: env.OPENAI_API_KEY });
  const result = await publishDailyEdition({ store, generate, logger });
  logger.info?.(JSON.stringify({ event: "publisher_complete", ...result }));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublisherJob().catch((error) => {
    console.error(JSON.stringify({
      event: "publisher_failed",
      code: error?.errorCode || error?.name || "Error"
    }));
    process.exitCode = 1;
  });
}
