import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSite } from "./build-site.mjs";
import { dateFromPath, datePath, legacyDateRedirect } from "../public/date-route.js";
import { newYorkDay } from "../lib/new-york-day.mjs";
import { showState } from "../lib/site-template.mjs";

const host = "127.0.0.1";
const port = 4173;
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"]
]);

function respond(response, status, body = "") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(body);
}

export function createSiteServer(directory) {
  const publicDirectory = resolve(directory);
  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      respond(response, 405, "Method not allowed\n");
      return;
    }

    try {
      const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      const pathname = decodeURIComponent(requestUrl.pathname);
      const selectedDate = dateFromPath(pathname);
      const legacyTarget = legacyDateRedirect(requestUrl);
      const redirect = legacyTarget ?? (selectedDate && pathname !== datePath(selectedDate)
        ? `${datePath(selectedDate)}${requestUrl.search}` : null);
      if (redirect) {
        response.writeHead(308, { Location: redirect, "Cache-Control": "no-store" });
        response.end();
        return;
      }
      const relativePath = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
      const filePath = resolve(publicDirectory, `.${relativePath}`);

      if (!filePath.startsWith(`${publicDirectory}${sep}`)) {
        respond(response, 403, "Forbidden\n");
        return;
      }

      let body;
      try { body = await readFile(filePath); }
      catch (error) {
        if (error.code !== "ENOENT" && error.code !== "EISDIR") throw error;
        let html = await readFile(resolve(publicDirectory, "404.html"), "utf8");
        if (selectedDate && selectedDate >= newYorkDay()) {
          html = showState(html, "not-yet");
        }
        response.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        response.end(request.method === "HEAD" ? undefined : html);
        return;
      }
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream"
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch (error) {
      if (error instanceof URIError) {
        respond(response, 400, "Bad request\n");
        return;
      }
      if (error?.code === "ENOENT" || error?.code === "EISDIR") {
        respond(response, 404, "Not found\n");
        return;
      }
      console.error("Quiet News local request failed.");
      respond(response, 500, "Internal server error\n");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await buildSite(fileURLToPath(new URL("../", import.meta.url)));
    createSiteServer(result.directory).on("error", () => {
      console.error("Quiet News could not start the local server. Check whether the preview port is already in use.");
      process.exitCode = 1;
    }).listen(port, host, () => {
      console.log(`Quiet News is available at http://localhost:${port}/ (${result.dates} saved days).`);
    });
  } catch {
    console.error("Quiet News local site generation failed.");
    process.exitCode = 1;
  }
}
