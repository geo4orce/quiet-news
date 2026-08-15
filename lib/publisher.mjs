import { createPublication } from "./publication.mjs";
import { publicationWindow } from "./new-york-day.mjs";

const DEFAULT_RETRY_DELAYS_MS = [1_000, 5_000];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function publishDailyEdition({
  store,
  generate,
  now = () => new Date(),
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  sleep = wait,
  logger = console
}) {
  if (!store || typeof generate !== "function") {
    throw new TypeError("A publication store and generator are required");
  }

  const window = publicationWindow(now());
  if (await store.hasEdition(window.editionDay)) {
    logger.info?.(`Edition ${window.editionDay} is already published`);
    return { status: "already_published", editionDate: window.editionDay };
  }

  const current = await store.readCurrent({ optional: true });
  const priorEdition = current ? { stories: current.stories } : { stories: [] };
  let generated;

  for (let attempt = 0; ; attempt += 1) {
    try {
      generated = await generate({ editionDay: window.editionDay, priorEdition });
      break;
    } catch (error) {
      if (!error?.retryable || attempt >= retryDelaysMs.length) throw error;
      logger.warn?.(`Generation attempt ${attempt + 1} failed with ${error.errorCode}; retrying`);
      await sleep(retryDelaysMs[attempt]);
    }
  }

  const publication = createPublication(window, generated.edition);
  await store.publish(publication);
  logger.info?.(`Published edition ${window.editionDay}`);
  return {
    status: "published",
    editionDate: window.editionDay,
    metadata: generated.metadata
  };
}
