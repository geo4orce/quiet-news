export function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const datePath = (date) => {
  if (!calendarDate(date)) throw new TypeError("Invalid saved date");
  return `/${date}/`;
};

export function dateFromPath(pathname) {
  const match = /^\/(\d{4}-\d{2}-\d{2})(?:\/(?:index\.html)?)?$/.exec(pathname);
  return match && calendarDate(match[1]) ? match[1] : null;
}

export function legacyDateRedirect(url) {
  if (url.pathname !== "/" && url.pathname !== "/index.html") return null;
  const date = url.searchParams.get("date");
  if (!calendarDate(date)) return null;
  const target = new URL(url);
  target.pathname = datePath(date);
  target.searchParams.delete("date");
  return `${target.pathname}${target.search}${target.hash}`;
}
