/**
 * The development server: `deno serve router.tsx`.
 *
 * Compiles `client/` on startup with `@remix-kbn/assets-deno` — every entrypoint in one
 * `Deno.bundle` graph, so a module two islands import is one chunk and one instance — and serves
 * the chunks itself. Production runs the same app on Cloudflare Workers from `worker.ts`, with the
 * bundle built ahead of time by `build.ts`.
 */

import { createApp } from "./app.tsx";
import { compileClient } from "./compile.ts";
import { entryPath, RUNTIME_ENTRY } from "./scripts.ts";

const assets = await compileClient();
const runtime = await assets.getScriptEntry(RUNTIME_ENTRY);

export default createApp({
  getScriptEntry: (id) => assets.getScriptEntry(entryPath(id)),
  runtime: { src: runtime.href, preloads: runtime.preloads },
}, (request) => assets.fetch(request));
