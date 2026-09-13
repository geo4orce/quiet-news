const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field));

export const storyImageInput = (story) => JSON.stringify([
  story.headline, story.body, story.sources.map(({ name, url }) => [name, url])
]);

export async function storyImageId(story) {
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(storyImageInput(story)));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function validImageManifest(value, date) {
  return exact(value, ["version", "edition_date", "images"]) && value.version === 1
    && /^\d{4}-\d{2}-\d{2}$/.test(date) && value.edition_date === date && object(value.images)
    && Object.keys(value.images).length <= 20
    && Object.entries(value.images).every(([id, image]) => /^[a-f0-9]{64}$/.test(id)
      && exact(image, ["src", "alt", "width", "height"])
      && image.src === `/images/${date}/${id}.jpg`
      && typeof image.alt === "string" && image.alt.trim().length > 0 && image.alt.length <= 1000
      && image.width === 1536 && image.height === 1024);
}

export const dailyImagesEnabled = (hostname) => hostname === "dev.quiet-news.com"
  || hostname === "localhost" || hostname === "127.0.0.1";

export const imageDataUrl = (path, hostname) => hostname === "dev.quiet-news.com"
  ? `https://raw.githubusercontent.com/geo4orce/quiet-news/main/public${path}` : path;

export async function loadDailyImages(publication, { hostname = globalThis.location?.hostname, fetcher = globalThis.fetch } = {}) {
  if (!dailyImagesEnabled(hostname) || publication.stories.length === 0) return [];
  try {
    const response = await fetcher(imageDataUrl(`/images/${publication.edition_date}/index.json`, hostname), {
      cache: "no-store", signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return [];
    const manifest = await response.json();
    if (!validImageManifest(manifest, publication.edition_date)) return [];
    return await Promise.all(publication.stories.map(async (story) => {
      const image = manifest.images[await storyImageId(story)];
      return image ? { ...image, src: imageDataUrl(image.src, hostname) } : null;
    }));
  } catch {
    // Optional images must never change the news state or expose raw errors.
    return [];
  }
}
