/**
 * The files under `client/static/`, served verbatim — in development.
 *
 * On Workers these URLs are Static Assets, answered before the Worker runs, so this only ever reads
 * files under `deno serve`. A handful of files — the stylesheet, the icons, the service
 * worker — so this is a lookup rather than a file server: a path that names anything outside the
 * directory, or a type not listed here, is a 404.
 */

const TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  webmanifest: "application/manifest+json",
};

/**
 * @param path A path relative to `client/static/`
 * @param cacheControl How long a browser may keep it
 * @returns The file, or a 404
 */
export async function serveStatic(
  path: string,
  cacheControl = "public, max-age=3600",
): Promise<Response> {
  const type = TYPES[path.split(".").pop() ?? ""];
  if (!type || path.split("/").some((part) => part === ".." || part === "")) {
    return notFound();
  }
  try {
    const staticDir = new URL("../client/static/", import.meta.url);
    const body = await Deno.readFile(new URL(path, staticDir));
    return new Response(body, {
      headers: { "content-type": type, "cache-control": cacheControl },
    });
  } catch {
    return notFound();
  }
}

export function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
