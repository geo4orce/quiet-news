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

const formatMonth = (month) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "long",
  year: "numeric"
}).format(new Date(`${month}-01T12:00:00Z`));

const moveMonth = (month, offset) => {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

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

function renderArchiveCalendar({ dates, selectedDate, month }) {
  const publishedDates = new Set(dates);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const calendar = document.querySelector("#archive-calendar");
  const cells = [];

  document.querySelector("#archive-month").textContent = formatMonth(month);

  for (let index = 0; index < 42; index += 1) {
    const dayNumber = index - firstWeekday + 1;
    if (dayNumber < 1 || dayNumber > dayCount) {
      const empty = document.createElement("span");
      empty.className = "calendar-day calendar-day-empty";
      empty.setAttribute("aria-hidden", "true");
      cells.push(empty);
      continue;
    }

    const date = `${month}-${String(dayNumber).padStart(2, "0")}`;
    if (publishedDates.has(date)) {
      const link = document.createElement("a");
      link.className = "calendar-day";
      link.href = `/?date=${date}`;
      link.textContent = String(dayNumber);
      link.setAttribute("role", "gridcell");
      link.setAttribute("aria-label", formatEditionDate(date));
      if (selectedDate === date) link.setAttribute("aria-current", "date");
      cells.push(link);
    } else {
      const day = document.createElement("button");
      day.className = "calendar-day";
      day.type = "button";
      day.disabled = true;
      day.textContent = String(dayNumber);
      day.setAttribute("role", "gridcell");
      day.setAttribute("aria-label", `${formatEditionDate(date)}, no edition`);
      cells.push(day);
    }
  }

  calendar.replaceChildren(...cells);
}

function setupArchive({ dates, selectedDate }) {
  const archive = document.querySelector("#archive");
  const toggle = document.querySelector("#archive-toggle");
  const label = document.querySelector("#archive-label");
  const menu = document.querySelector("#archive-menu");
  const today = document.querySelector("#archive-today");
  const previous = document.querySelector("#archive-previous");
  const next = document.querySelector("#archive-next");
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const minimumMonth = months[0];
  const maximumMonth = months.at(-1);
  let month = selectedDate?.slice(0, 7) ?? maximumMonth;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
    if (open) requestAnimationFrame(() => menu.querySelector("[aria-current]")?.focus());
  };

  const render = () => {
    renderArchiveCalendar({ dates, selectedDate, month });
    previous.disabled = month <= minimumMonth;
    next.disabled = month >= maximumMonth;
  };

  label.textContent = selectedDate === null ? "Today" : formatEditionDate(selectedDate);
  if (selectedDate === null) today.setAttribute("aria-current", "page");
  toggle.addEventListener("click", () => setOpen(menu.hidden));
  previous.addEventListener("click", () => {
    month = moveMonth(month, -1);
    render();
  });
  next.addEventListener("click", () => {
    month = moveMonth(month, 1);
    render();
  });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !archive.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  render();
  archive.hidden = false;
}

async function loadArchive(selectedDate) {
  try {
    const value = await fetchJson("/data/index.json");
    if (!validIndex(value) || value.dates.length === 0) throw new Error("Invalid index");
    setupArchive({ dates: value.dates, selectedDate });
  } catch {
    // Archive navigation is optional. Current content remains usable.
  }
}

const requestedDate = new URLSearchParams(location.search).get("date");
const selectedDate = calendarDate(requestedDate) ? requestedDate : null;
loadPublication(selectedDate);
loadArchive(selectedDate);
