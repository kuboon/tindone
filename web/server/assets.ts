/**
 * The browser modules, compiled as one graph at startup.
 *
 * Every entrypoint goes into a single `Deno.bundle({ codeSplitting: true })` call, so a module two
 * of them import — the Remix UI runtime, the DPoP session store — is emitted once into a chunk they
 * share, and is one instance at runtime rather than a copy per island.
 *
 * Islands are globbed: a file in `client/islands/` is an entrypoint by being there, and helpers in
 * `islands/_lib/` are left out by depth.
 */

import { createAssetServer } from "@remix-kbn/assets-deno";

const clientDir = new URL("../client/", import.meta.url);

export const assetsPath = "/assets";

export const assets = await createAssetServer({
  rootDir: decodeURIComponent(clientDir.pathname),
  entrypoints: ["hydration.ts", "islands/*.tsx"],
  basePath: assetsPath,
  mode: "bundle",
  bundle: { sourcemap: "none" },
  cacheControl: "public, max-age=300",
});

const entry = await assets.getScriptEntry("hydration.ts");

/** The `<script type="module">` a page with islands loads, and the chunks to preload behind it. */
export const clientRuntime = { src: entry.href, preloads: entry.preloads };
