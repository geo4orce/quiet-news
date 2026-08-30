import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const host = "127.0.0.1";
const port = 4173;
const publicDirectory = resolve(fileURLToPath(new URL("../public/", import.meta.url)));
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
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

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    respond(response, 405, "Method not allowed\n");
    return;
  }

  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);
    const relativePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = resolve(publicDirectory, `.${relativePath}`);

    if (!filePath.startsWith(`${publicDirectory}${sep}`)) {
      respond(response, 403, "Forbidden\n");
      return;
    }

    const body = await readFile(filePath);
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
    console.error(error);
    respond(response, 500, "Internal server error\n");
  }
});

server.listen(port, host, () => {
  console.log(`Quiet News is available at http://localhost:${port}/`);
});
