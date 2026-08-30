export const GENERATION_MODEL = "gpt-5.6-sol";

const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

export function generationPromptsFrom(env = process.env) {
  const discovery = env.QUIET_NEWS_DISCOVERY_PROMPT;
  const sift = env.QUIET_NEWS_SIFT_PROMPT;
  const discoveryVersion = env.QUIET_NEWS_DISCOVERY_PROMPT_VERSION;
  const siftVersion = env.QUIET_NEWS_SIFT_PROMPT_VERSION;
  if (!nonEmpty(discovery) || !nonEmpty(sift)
    || !nonEmpty(discoveryVersion) || !nonEmpty(siftVersion)) {
    throw new Error("Quiet News generation prompts are not configured");
  }
  return {
    discovery: discovery.trim(),
    discoveryVersion: discoveryVersion.trim(),
    sift: sift.trim(),
    siftVersion: siftVersion.trim()
  };
}

const priorStories = (priorEdition) => Array.isArray(priorEdition?.stories)
  ? priorEdition.stories
  : [];

export function discoveryInput(targetDay, priorEdition) {
  return JSON.stringify({
    target_day: targetDay,
    timezone: "America/New_York",
    prior_stories: priorStories(priorEdition)
  });
}

export function siftInput(targetDay, priorEdition, candidateSet) {
  return JSON.stringify({
    target_day: targetDay,
    timezone: "America/New_York",
    prior_stories: priorStories(priorEdition),
    candidate_set: candidateSet
  });
}
