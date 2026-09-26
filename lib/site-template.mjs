// Small helpers for our trusted template, not a parser for arbitrary HTML.
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function replaceOne(html, pattern, replacement) {
  let count = 0;
  const result = html.replaceAll(pattern, (match) => {
    count++;
    return typeof replacement === "function" ? replacement(match) : replacement;
  });
  if (count !== 1) throw new Error("Site template marker is missing or duplicated");
  return result;
}

export const fillSlot = (html, name, content) => replaceOne(html, `<!-- ${name} -->`, content);
const attributePattern = (name) => new RegExp(`\\s${name}(?:\\s*=\\s*(["'])(.*?)\\1)?(?=\\s|/?>)`, "s");
const attributeValue = (tag, name) => tag.match(attributePattern(name))?.[2] ?? "";

export function setAttribute(tag, name, value) {
  const pattern = attributePattern(name);
  const attribute = value === null ? "" : ` ${name}="${escapeHtml(value)}"`;
  return pattern.test(tag) ? tag.replace(pattern, () => attribute)
    : tag.replace(/\s*\/?>$/, (end) => attribute + end);
}

export function editTag(html, attribute, value, edit) {
  // Attribute names and selector values are fixed internal identifiers.
  const selector = value === null ? `\\s${attribute}(?=\\s|=|/?>)`
    : `\\s${attribute}\\s*=\\s*(["'])${value}\\1`;
  return replaceOne(html, new RegExp(`<[a-z][\\w:-]*(?=\\s|>)(?=[^>]*${selector})[^>]*>`, "gi"), edit);
}

export function toggleClass(tag, name, enabled) {
  const classes = new Set(attributeValue(tag, "class").split(/\s+/).filter(Boolean));
  if (enabled) classes.add(name);
  else classes.delete(name);
  return setAttribute(tag, "class", classes.size ? [...classes].join(" ") : null);
}

export function showState(html, selected) {
  for (const id of ["stories", "news-loading", "current-quiet", "archive-quiet", "unavailable", "not-yet", "error"]) {
    html = editTag(html, "id", id, (tag) => toggleClass(tag, "hidden", id !== selected));
  }
  return html;
}
