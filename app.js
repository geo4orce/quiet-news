import { assertValidSnapshot, statusLabel } from "./scripts/snapshot.mjs";
import { createMockSnapshot, mockCountFromSearch } from "./mock-data.js";

const elements = {
  eyebrow: document.querySelector("#edition-eyebrow"),
  title: document.querySelector("#edition-title"),
  intro: document.querySelector("#edition-intro"),
  loadStatus: document.querySelector("#load-status"),
  mockNotice: document.querySelector("#mock-notice"),
  stories: document.querySelector("#stories"),
  empty: document.querySelector("#empty-state"),
  emptyStatus: document.querySelector("#empty-status"),
  emptyTitle: document.querySelector("#empty-title"),
  emptyCopy: document.querySelector("#empty-copy"),
  storyTemplate: document.querySelector("#story-template")
};

function editionDate(date, timezone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00Z`));
}

function sourceLink(source) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.href = source.url;
  link.textContent = source.name;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  item.append(link);
  return item;
}

function storyCard(story, index) {
  const fragment = elements.storyTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".story-card");
  const status = fragment.querySelector(".story-status");

  fragment.querySelector(".story-number").textContent = String(index + 1).padStart(2, "0");
  status.textContent = statusLabel(story.status);
  status.dataset.status = story.status;
  fragment.querySelector(".story-headline").textContent = story.headline;
  fragment.querySelector(".story-summary").textContent = story.summary;
  fragment.querySelector(".comparison-copy").textContent = story.since_yesterday;

  const sourceList = fragment.querySelector(".source-list");
  story.sources.forEach((source) => sourceList.append(sourceLink(source)));
  card.id = story.id;
  return fragment;
}

function renderPreview(snapshot) {
  elements.emptyTitle.textContent = snapshot.empty_message;
  elements.loadStatus.textContent = "Preview snapshot loaded.";
}

function renderPublished(snapshot, { mock = false } = {}) {
  const date = editionDate(snapshot.edition_date, snapshot.timezone);
  elements.eyebrow.textContent = mock
    ? `Design mock · ${snapshot.stories.length} ${snapshot.stories.length === 1 ? "story" : "stories"}`
    : `Daily snapshot · ${date}`;
  elements.title.textContent = "Today’s snapshot.";
  elements.intro.textContent = mock
    ? `Layout test with ${snapshot.stories.length} fictional ${snapshot.stories.length === 1 ? "story" : "stories"}. The real snapshot was not loaded.`
    : snapshot.stories.length === 1
      ? "One important story, with what changed since yesterday. One edition shared by everyone."
      : `${snapshot.stories.length} important stories, each with what changed since yesterday. One edition shared by everyone.`;

  if (snapshot.stories.length === 0) {
    elements.emptyStatus.textContent = "Today’s edition";
    elements.emptyTitle.textContent = snapshot.empty_message;
    elements.emptyCopy.textContent =
      "We do not add filler to reach a quota. The next edition publishes tomorrow morning.";
    elements.loadStatus.textContent = `The ${date} edition has no selected stories.`;
    return;
  }

  elements.empty.hidden = true;
  elements.stories.hidden = false;
  snapshot.stories.forEach((story, index) => {
    elements.stories.append(storyCard(story, index));
  });
  elements.loadStatus.textContent = `${snapshot.stories.length} stories loaded for ${date}.`;
}

function renderError() {
  elements.emptyStatus.textContent = "Unavailable";
  elements.emptyTitle.textContent = "The snapshot could not be loaded.";
  elements.emptyCopy.textContent =
    "Please try again later. The most recent valid edition has not been replaced.";
  elements.loadStatus.textContent = "The daily snapshot could not be loaded.";
}

async function loadSnapshot() {
  try {
    const mockCount = mockCountFromSearch(window.location.search);
    if (mockCount !== null) {
      const robots = document.createElement("meta");
      robots.name = "robots";
      robots.content = "noindex, nofollow";
      document.head.append(robots);
      elements.mockNotice.hidden = false;
      renderPublished(assertValidSnapshot(createMockSnapshot(mockCount)), { mock: true });
      return;
    }

    const response = await fetch("./data/snapshot.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Snapshot request failed with ${response.status}`);
    }
    const snapshot = assertValidSnapshot(await response.json());
    if (snapshot.state === "published") {
      renderPublished(snapshot);
    } else {
      renderPreview(snapshot);
    }
  } catch (error) {
    console.error(error);
    renderError();
  }
}

loadSnapshot();
