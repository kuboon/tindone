/**
 * Where each browser entrypoint was compiled to — the one thing about the client bundle the server
 * needs at render time.
 *
 * `render({ assets })` asks for a `getScriptEntry(id)` for every `clientEntry` it renders, and for
 * `file:` ids only. An island names itself `file://client/islands/<name>.tsx#<Export>` rather than
 * with `import.meta.url`: the Worker is one minified bundle, where every module's `import.meta.url`
 * is the same and function names are mangled, so both the module and the export are written down.
 * The path is under `client/`, which is what both hosts resolve it against:
 *
 * - **In development** (`router.tsx`), `@remix-kbn/assets-deno` compiles `client/` on startup and
 *   answers for it directly.
 * - **On Workers** (`worker.ts`), there is no bundler; `build.ts` compiled everything ahead of time
 *   and wrote down each entry's URL and preloads in `dist/manifest.json`, which this reads back.
 */

import type { ClientRuntime } from "../client/layout.tsx";

/** What `render()` asks about one entry. */
export interface ScriptEntry {
  href: string;
  preloads: string[];
  importMap: { imports: Record<string, string> };
}

/** The compiled client, as the app sees it. */
export interface Scripts {
  getScriptEntry(id: string): Promise<ScriptEntry>;
  /** The runtime every page with an island loads. */
  runtime: ClientRuntime;
}

/** Entrypoint path under `client/` → where it was compiled to. */
export type ScriptManifest = Record<
  string,
  { href: string; preloads: string[] }
>;

/** The client entrypoints, as paths under `client/`. The runtime first. */
export const RUNTIME_ENTRY = "hydration.ts";
export const ISLAND_ENTRIES = "islands/*.tsx";

const PREFIX = "file://client/";

/**
 * @param id A `clientEntry` id
 * @returns The entrypoint path under `client/` it names
 */
export function entryPath(id: string): string {
  if (!id.startsWith(PREFIX)) {
    throw new Error(
      `clientEntry id "${id}" should be "${PREFIX}<path under client/>"`,
    );
  }
  return id.slice(PREFIX.length);
}

/**
 * The client, answered from a prebuilt manifest.
 *
 * @param manifest What `build.ts` wrote
 * @returns The scripts, for {@link createApp}
 */
export function scriptsFromManifest(manifest: ScriptManifest): Scripts {
  const lookup = (path: string) => {
    const entry = manifest[path];
    if (!entry) throw new Error(`"${path}" is not a built client entrypoint`);
    return entry;
  };
  const runtime = lookup(RUNTIME_ENTRY);
  return {
    getScriptEntry(id) {
      const { href, preloads } = lookup(entryPath(id));
      return Promise.resolve({ href, preloads, importMap: { imports: {} } });
    },
    runtime: { src: runtime.href, preloads: runtime.preloads },
  };
}
