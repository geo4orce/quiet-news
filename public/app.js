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
  && Array.isArray(story.sources)
  && story.sources.length > 0
    && story.sources.every((source) => isObject(source)
      && hasOnly(source, SOURCE_FIELDS)
      && nonEmpty(source.name)
      && httpsUrl(source.url));

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

export const selectedDateFrom = (value) => calendarDate(value) ? value : null;

export function classifyDateRequest(selectedDate, dates, today) {
  if (selectedDate === null) return "current";
  if (dates.includes(selectedDate)) return "saved";
  return selectedDate >= today ? "not-yet" : "unavailable";
}

export function publicationState(selectedDate, storyCount, failed = false) {
  if (failed) return "error";
  if (storyCount > 0) return "stories";
  return selectedDate === null ? "current-quiet" : "archive-quiet";
}

const newYorkToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatDay = (date) => new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric"
}).format(new Date(`${date}T12:00:00Z`));

export const formatArchiveToggleLabel = (date) => {
  if (date === null) return "Jump to date";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric"
  }).formatToParts(new Date(`${date}T12:00:00Z`));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.month}-${values.day}`;
};

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

function showNewsState(id) {
  document.querySelectorAll("[data-news-state]").forEach((state) => {
    state.classList.toggle("hidden", state.id !== id);
  });
}

function renderPublication(publication, selectedDate) {
  const stories = document.querySelector("#stories");
  const template = document.querySelector("#story-template");
  stories.replaceChildren();

  if (publication.stories.length === 0) {
    showNewsState(publicationState(selectedDate, 0));
    return;
  }

  const renderedStories = [];
  const syncAllControl = () => {
    const control = stories.querySelector("[data-stories-toggle]");
    if (!control) return;
    const allOpen = renderedStories.every((article) => !article.querySelector("[data-story-details]").hidden);
    control.textContent = allOpen ? "Close all" : "Open all";
    control.setAttribute("aria-expanded", String(allOpen));
  };
  const setStoryOpen = (article, open) => {
    article.querySelector(".story-toggle").setAttribute("aria-expanded", String(open));
    article.querySelector("[data-story-details]").hidden = !open;
    syncAllControl();
  };

  publication.stories.forEach((story, index) => {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector("[data-story]");
    const toggle = article.querySelector(".story-toggle");
    const headline = article.querySelector("[data-story-headline]");
    const details = article.querySelector("[data-story-details]");
    const body = article.querySelector("[data-story-body]");
    const sources = article.querySelector("[data-story-sources]");
    const detailsId = `story-details-${index + 1}`;
    headline.textContent = story.headline;
    details.id = detailsId;
    toggle.setAttribute("aria-controls", detailsId);
    body.textContent = story.body;
    sources.append(document.createTextNode(story.sources.length === 1 ? "Source:" : "Sources:"));
    story.sources.forEach((source) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.name;
      sources.append(link);
    });
    toggle.addEventListener("click", () => {
      setStoryOpen(article, toggle.getAttribute("aria-expanded") !== "true");
    });
    renderedStories.push(article);
    stories.append(fragment);
  });

  if (renderedStories.length > 1) {
    const controls = document.createElement("p");
    const toggleAll = document.createElement("button");
    controls.className = "story-controls";
    toggleAll.className = "stories-toggle";
    toggleAll.type = "button";
    toggleAll.textContent = "Open all";
    toggleAll.dataset.storiesToggle = "";
    toggleAll.setAttribute("aria-expanded", "false");
    toggleAll.addEventListener("click", () => {
      const open = !renderedStories.every((article) => !article.querySelector("[data-story-details]").hidden);
      renderedStories.forEach((article) => setStoryOpen(article, open));
    });
    controls.append(toggleAll);
    stories.append(controls);
  }

  showNewsState(publicationState(selectedDate, publication.stories.length));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json();
}

async function loadPublication(selectedDate) {
  try {
    const isArchive = selectedDate !== null;
    const value = await fetchJson(isArchive ? `/data/${selectedDate}.json` : "/data/current.json");
    if (!validPublication(value) || (isArchive && value.edition_date !== selectedDate)) {
      throw new Error("Invalid daily file");
    }
    if (!isArchive && Date.parse(value.expires_at) <= Date.now()) {
      throw new Error("Today's file expired");
    }
    renderPublication(value, selectedDate);
  } catch {
    console.error("Quiet News publication load failed.", {
      code: selectedDate === null ? "current_load_failed" : "archive_load_failed",
      date: selectedDate
    });
    showNewsState(publicationState(selectedDate, 0, true));
  }
}

function renderArchiveCalendar({ dates, selectedDate, month, today }) {
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
      link.setAttribute("aria-label", formatDay(date));
      if (selectedDate === date) link.setAttribute("aria-current", "date");
      cells.push(link);
    } else {
      const day = document.createElement("button");
      day.className = "calendar-day";
      day.type = "button";
      day.disabled = true;
      day.textContent = String(dayNumber);
      day.setAttribute("role", "gridcell");
      const status = classifyDateRequest(date, dates, today) === "not-yet"
        ? "not yet"
        : "unavailable";
      day.setAttribute("aria-label", `${formatDay(date)}, ${status}`);
      cells.push(day);
    }
  }

  calendar.replaceChildren(...cells);
}

function setupArchive({ dates, selectedDate, today }) {
  const archive = document.querySelector("#archive");
  const toggle = document.querySelector("#archive-toggle");
  const menu = document.querySelector("#archive-menu");
  const todayLink = document.querySelector("#archive-today");
  const previous = document.querySelector("#archive-previous");
  const next = document.querySelector("#archive-next");
  const months = [...new Set(dates.map((date) => date.slice(0, 7)))].sort();
  const minimumMonth = months[0];
  const maximumMonth = months.at(-1);
  const requestedMonth = selectedDate?.slice(0, 7) ?? maximumMonth;
  let month = requestedMonth < minimumMonth
    ? minimumMonth
    : requestedMonth > maximumMonth
      ? maximumMonth
      : requestedMonth;

  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("hidden", !open);
    if (open) requestAnimationFrame(() => menu.querySelector("[aria-current]")?.focus());
  };

  const render = () => {
    renderArchiveCalendar({ dates, selectedDate, month, today });
    previous.disabled = month <= minimumMonth;
    next.disabled = month >= maximumMonth;
  };

  toggle.textContent = formatArchiveToggleLabel(selectedDate);
  if (selectedDate !== null) {
    toggle.setAttribute("aria-label", `Jump to date. Showing ${formatDay(selectedDate)}`);
  }
  todayLink.classList.toggle("hidden", selectedDate === null);
  toggle.addEventListener("click", () => setOpen(menu.classList.contains("hidden")));
  previous.addEventListener("click", () => {
    month = moveMonth(month, -1);
    render();
  });
  next.addEventListener("click", () => {
    month = moveMonth(month, 1);
    render();
  });
  document.addEventListener("click", (event) => {
    if (!menu.classList.contains("hidden") && !archive.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.classList.contains("hidden")) {
      setOpen(false);
      toggle.focus();
    }
  });

  render();
  archive.classList.remove("hidden");
}

async function loadArchive(selectedDate, today) {
  try {
    const value = await fetchJson("/data/index.json");
    if (!validIndex(value) || value.dates.length === 0) throw new Error("Invalid index");
    setupArchive({ dates: value.dates, selectedDate, today });
    return value.dates;
  } catch {
    console.warn("Quiet News archive navigation is unavailable.", {
      code: "archive_index_unavailable"
    });
    // Archive navigation is optional. Current content remains usable.
    return null;
  }
}

async function loadPage(selectedDate, today) {
  if (selectedDate === null) {
    loadPublication(null);
    loadArchive(null, today);
    return;
  }

  const dates = await loadArchive(selectedDate, today);
  if (dates === null) {
    loadPublication(selectedDate);
    return;
  }

  const state = classifyDateRequest(selectedDate, dates, today);
  if (state === "saved") {
    loadPublication(selectedDate);
    return;
  }
  if (state === "unavailable") {
    console.warn("Quiet News received an unavailable archive date.", {
      code: "archive_date_unavailable",
      date: selectedDate
    });
  }
  showNewsState(state);
}

if (typeof window !== "undefined") {
  const requestedDate = new URLSearchParams(location.search).get("date");
  const selectedDate = selectedDateFrom(requestedDate);
  if (requestedDate !== null && selectedDate === null) {
    console.warn("Quiet News ignored an invalid date parameter.", {
      code: "invalid_date_parameter"
    });
    const cleanUrl = new URL(location.href);
    cleanUrl.searchParams.delete("date");
    history.replaceState(null, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }
  loadPage(selectedDate, newYorkToday());
}
