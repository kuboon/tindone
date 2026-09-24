/**
 * The Markdown documents under `docs/`, converted with `@kuboon/md`.
 *
 * Conversion (unified, Shiki) is too heavy for a Worker, so it happens ahead of time: `router.tsx`
 * converts on startup, `build.ts` writes the result to `dist/docs.json` for the Worker. Either way
 * the app is handed plain hast trees and renders them with `hastToRemix`, which is small. Only
 * those two files import this one.
 */

import { markdownToHast } from "@kuboon/md";

import type { Doc, Docs } from "./app.tsx";

const docsDir = new URL("../docs/", import.meta.url);

type Node = Doc["hast"] | Doc["hast"]["children"][number];

function textOf(node: Node): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

/** @returns Every `docs/<slug>.md`, by slug, titled by its first `#` heading */
export async function loadDocs(): Promise<Docs> {
  const docs: Docs = {};
  for await (const entry of Deno.readDir(docsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    const hast = await markdownToHast(
      await Deno.readTextFile(new URL(entry.name, docsDir)),
    );
    const h1 = hast.children.find((node) =>
      node.type === "element" && node.tagName === "h1"
    );
    docs[entry.name.slice(0, -3)] = {
      title: h1 ? textOf(h1) : entry.name,
      hast,
    };
  }
  return docs;
}
