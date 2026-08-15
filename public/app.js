const CURRENT_ERROR = "Today's edition could not be published. Please come back later.";
const PUBLICATION_FIELDS = ["edition_date", "published_at", "expires_at", "stories"];
const STORY_FIELDS = ["headline", "body", "sources"];
const SOURCE_FIELDS = ["name", "url"];
const INDEX_FIELDS = ["updated_at", "dates"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value, fields) => Object.keys(value).every((field) => fields.includes(field));
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const calendarDate = (value) => typeof value === "string"
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const isoInstant = (value) => typeof value === "string"
  && !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;
const httpsUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
};

const validStory = (story) => isObject(story)
  && hasOnly(story, STORY_FIELDS)
  && nonEmpty(story.headline)
  && nonEmpty(story.body)
  && (story.sources === undefined || (Array.isArray(story.sources)
    && story.sources.every((source) => isObject(source)
      && hasOnly(source, SOURCE_FIELDS)
      && nonEmpty(source.name)
      && httpsUrl(source.url))));

const validPublication = (value) => isObject(value)
  && hasOnly(value, PUBLICATION_FIELDS)
  && calendarDate(value.edition_date)
  && isoInstant(value.published_at)
  && isoInstant(value.expires_at)
  && value.expires_at > value.published_at
  && Array.isArray(value.stories)
  && value.stories.length <= 5
  && value.stories.every(validStory);

const validIndex = (value) => isObject(value)
  && hasOnly(value, INDEX_FIELDS)
  && isoInstant(value.updated_at)
  && Array.isArray(value.dates)
  && value.dates.every(calendarDate)
  && new Set(value.dates).size === value.dates.length
  && value.dates.every((date, index) => index === 0 || value.dates[index - 1] > date);

const formatEditionDate = (date) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric"
}).format(new Date(`${date}T12:00:00Z`));

function renderMessage(message) {
  const news = document.querySelector("#news");
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = message;
  news.replaceChildren(empty);
}

function renderPublication(publication) {
  const news = document.querySelector("#news");
  document.querySelector("#edition").textContent = formatEditionDate(publication.edition_date);
  news.replaceChildren();

  if (publication.stories.length === 0) {
    renderMessage("No stories for this edition.");
    return;
  }

  publication.stories.forEach((story) => {
    const article = document.createElement("article");
    const headline = document.createElement("h2");
    const body = document.createElement("p");
    headline.textContent = story.headline;
    body.className = "summary";
    body.textContent = story.body;
    article.append(headline, body);
    news.append(article);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error("Request failed");
  return response.json();
}

async function loadPublication(selectedDate) {
  try {
    const isArchive = selectedDate !== null;
    const value = await fetchJson(isArchive ? `/data/${selectedDate}.json` : "/data/current.json");
    if (!validPublication(value) || (isArchive && value.edition_date !== selectedDate)) {
      throw new Error("Invalid publication");
    }
    if (!isArchive && Date.parse(value.expires_at) <= Date.now()) {
      throw new Error("Expired publication");
    }
    renderPublication(value);
  } catch {
    renderMessage(selectedDate === null ? CURRENT_ERROR : "This archive edition is unavailable.");
  }
}

async function loadArchive(selectedDate) {
  try {
    const value = await fetchJson("/data/index.json");
    if (!validIndex(value)) throw new Error("Invalid index");
    const details = document.querySelector("#archive");
    const links = document.querySelector("#archive-links");
    const current = document.createElement("a");
    current.href = "/";
    current.textContent = "Current";
    if (selectedDate === null) current.setAttribute("aria-current", "page");
    links.replaceChildren(current);

    value.dates.forEach((date) => {
      const link = document.createElement("a");
      link.href = `/?date=${date}`;
      link.textContent = formatEditionDate(date);
      if (selectedDate === date) link.setAttribute("aria-current", "page");
      links.append(link);
    });
    details.hidden = false;
    details.open = selectedDate !== null;
  } catch {
    // Archive navigation is optional. Current content remains usable.
  }
}

const requestedDate = new URLSearchParams(location.search).get("date");
const selectedDate = calendarDate(requestedDate) ? requestedDate : null;
loadPublication(selectedDate);
loadArchive(selectedDate);
