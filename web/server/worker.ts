/**
 * The Cloudflare Workers entry.
 *
 * `build.ts` bundles this file into `dist/app.js` and writes `dist/index.js` beside it — the module
 * Wrangler deploys — which imports the three things that only exist after a build and hands them
 * in:
 *
 * - `manifest.json`, where each client entrypoint was compiled to (see `scripts.ts`);
 * - resvg's WebAssembly, as a compiled module: a Worker may not compile WebAssembly from bytes at
 *   run time, so it has to arrive as an import that Wrangler uploads as a module;
 * - the environment, which Workers pass to `fetch` rather than exposing globally.
 *
 * Everything under `dist/public/` — the client bundle, `static/`, `sw.js`, the web manifest — is
 * Static Assets, served before the Worker is asked; the `ASSETS` binding is how the card renderer
 * reads the fonts from there.
 */

import { createApp } from "./app.tsx";
import { setEnv } from "./config.ts";
import { setOgResources } from "./og.ts";
import { type ScriptManifest, scriptsFromManifest } from "./scripts.ts";

/** The bindings and variables `wrangler.jsonc` declares, plus secrets. */
export interface Env {
  ASSETS: { fetch(request: Request | string): Promise<Response> };
  [key: string]: unknown;
}

/**
 * @param manifest The client build's entry map
 * @param resvgWasm resvg's WebAssembly, compiled by the platform
 * @returns The Worker's handler
 */
export default function createWorker(
  manifest: ScriptManifest,
  resvgWasm: WebAssembly.Module,
) {
  let app: ReturnType<typeof createApp> | undefined;

  return {
    fetch(request: Request, env: Env): Promise<Response> {
      if (!app) {
        setEnv(env);
        setOgResources({
          wasm: () => Promise.resolve(resvgWasm),
          font: async (name) => {
            const response = await env.ASSETS.fetch(
              `https://assets.invalid/static/fonts/${name}`,
            );
            if (!response.ok) {
              throw new Error(`font ${name}: ${response.status}`);
            }
            return new Uint8Array(await response.arrayBuffer());
          },
        });
        app = createApp(scriptsFromManifest(manifest));
      }
      return app.fetch(request);
    },
  };
}
