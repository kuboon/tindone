/**
 * `client/`, compiled for the browser.
 *
 * Every entrypoint goes into one `Deno.bundle({ codeSplitting: true })` call through
 * `@remix-kbn/assets-deno`, so a module two islands import — the Remix UI runtime, the DPoP session
 * store — is emitted once, into a chunk they share, and is one instance at runtime rather than a
 * copy per island. `router.tsx` does this on startup for development; `build.ts` does it once and
 * writes the result to `dist/public/assets/` for Workers.
 */

import { createAssetServer } from "@remix-kbn/assets-deno";

import { ISLAND_ENTRIES, RUNTIME_ENTRY } from "./scripts.ts";

export const clientDir: string = decodeURIComponent(
  new URL("../client/", import.meta.url).pathname,
);

export async function compileClient() {
  return await createAssetServer({
    rootDir: clientDir,
    entrypoints: [RUNTIME_ENTRY, ISLAND_ENTRIES],
    basePath: "/assets",
    mode: "bundle",
    bundle: { sourcemap: "none" },
  });
}
