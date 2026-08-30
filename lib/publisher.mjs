import { createPublication } from "./publication.mjs";
import { addCalendarDays, publicationWindow } from "./new-york-day.mjs";

export async function publishDailyEdition({
  store,
  generate,
  now = () => new Date(),
  logger = console
}) {
  if (!store || typeof generate !== "function") {
    throw new TypeError("A publication store and generator are required");
  }

  const window = publicationWindow(now());
  if (await store.hasEdition(window.editionDay)) {
    logger.info?.(`${window.editionDay} is already saved`);
    return { status: "already_published", editionDate: window.editionDay };
  }

  const prior = await store.readEdition(addCalendarDays(window.editionDay, -1), { optional: true });
  const priorEdition = prior ? { stories: prior.stories } : { stories: [] };
  const generated = await generate({ editionDay: window.editionDay, priorEdition });

  const publication = createPublication(window, generated.edition);
  await store.publish(publication);
  logger.info?.(`Saved ${window.editionDay}`);
  return {
    status: "published",
    editionDate: window.editionDay,
    metadata: generated.metadata
  };
}
