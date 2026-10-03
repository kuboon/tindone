/**
 * The Cloudflare Workers entry.
 *
 * `build.ts` bundles this file into `dist/app.js` and writes `dist/index.js` beside it — the module
 * Wrangler deploys — which imports `manifest.json` (where each client entrypoint was compiled to,
 * see `scripts.ts`) and hands it in. The environment arrives with each request, because Workers
 * pass it to `fetch` rather than exposing it globally.
 *
 * Everything under `dist/public/` — the client bundle, `static/`, `sw.js`, the web manifest, and
 * every page, prerendered — is Static Assets, served before the Worker is asked. What reaches the
 * Worker is the API, and `/tasks/:taskId`: one shell serves every task, so it is answered from
 * Static Assets ({@link TASK_SHELL}) rather than rendered again.
 */

import type { D1DatabaseBinding } from "@remix-kbn/data-table-d1";

import { createApp, type Docs } from "./app.tsx";
import { setEnv } from "./config.ts";
import { setDatabaseBinding } from "./db.ts";
import { type ScriptManifest, scriptsFromManifest } from "./scripts.ts";
import { routes } from "../client/routes.ts";

/** The task page every task id is served, as `build.ts` wrote it. */
export const TASK_SHELL = routes.tasks.show.href({ taskId: "_" });

/** `routes.tasks.show`, as a test on a path. */
const TASK_PAGE = /^\/tasks\/[^/]+$/;

/** Static Assets, when the Worker has the binding (`assets.binding` in `wrangler.jsonc`). */
interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

/**
 * @param manifest The client build's entry map
 * @param docs `docs/`, converted at build time
 * @returns The Worker's handler
 */
export default function createWorker(manifest: ScriptManifest, docs: Docs) {
  let app: ReturnType<typeof createApp> | undefined;

  return {
    fetch(request: Request, env: Record<string, unknown>): Promise<Response> {
      if (!app) {
        setEnv(env);
        if (!env.DB) throw new Error("The DB binding (D1) is not configured");
        setDatabaseBinding(env.DB as D1DatabaseBinding);
        app = createApp(scriptsFromManifest(manifest), { docs });
      }
      const assets = env.ASSETS as AssetsBinding | undefined;
      const url = new URL(request.url);
      if (
        assets && (request.method === "GET" || request.method === "HEAD") &&
        TASK_PAGE.test(url.pathname)
      ) {
        return assets.fetch(new Request(new URL(TASK_SHELL, url), request));
      }
      return app.fetch(request);
    },
  };
}
