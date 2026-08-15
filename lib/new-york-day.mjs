const TIME_ZONE = "America/New_York";

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const offsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "shortOffset",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function isCalendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function newYorkDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError("A valid date is required");
  const parts = Object.fromEntries(
    dayFormatter.formatToParts(date)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value: partValue }) => [type, partValue])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addCalendarDays(day, amount) {
  if (!isCalendarDay(day) || !Number.isInteger(amount)) {
    throw new TypeError("A valid calendar day and integer amount are required");
  }
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function newYorkOffsetMinutes(day) {
  const probe = new Date(`${day}T12:00:00Z`);
  const zone = offsetFormatter.formatToParts(probe)
    .find(({ type }) => type === "timeZoneName")?.value;
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone || "");
  if (!match) throw new Error("New York UTC offset is unavailable");
  const direction = match[1] === "+" ? 1 : -1;
  return direction * ((Number(match[2]) * 60) + Number(match[3] || 0));
}

export function newYorkLocalTime(day, hour, minute = 0) {
  if (!isCalendarDay(day) || !Number.isInteger(hour) || hour < 0 || hour > 23
    || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new TypeError("A valid New York local date and time are required");
  }
  const [year, month, date] = day.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, date, hour, minute)
    - (newYorkOffsetMinutes(day) * 60_000);
  return new Date(utc);
}

export function publicationWindow(value = new Date()) {
  const publishedAt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(publishedAt.getTime())) throw new TypeError("A valid date is required");
  const publicationDay = newYorkDay(publishedAt);
  const editionDay = addCalendarDays(publicationDay, -1);
  const expiryDay = addCalendarDays(publicationDay, 1);
  return {
    editionDay,
    publishedAt: publishedAt.toISOString(),
    expiresAt: newYorkLocalTime(expiryDay, 5).toISOString()
  };
}
