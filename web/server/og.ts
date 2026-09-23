/**
 * A task's social card: `/tasks/:taskId/og.png`.
 *
 * Task pages are shareable, and a link preview is what someone sees before they open one — so the
 * card is the task's own words, drawn by `og/card.ts` on first request. Cards are cached in memory
 * by content and list, so a preview crawler hitting the same task twice costs one drawing.
 */

import { renderCard } from "./og/card.ts";

const cache = new Map<string, Uint8Array<ArrayBuffer>>();
const CACHE_LIMIT = 200;

/**
 * @param task What the card says
 * @param host Where the task lives, for the footer line
 * @returns The PNG response
 */
export async function taskImage(
  task: { content: string; list: string },
  host: string,
): Promise<Response> {
  const key = JSON.stringify([task.content, task.list, host]);
  let png = cache.get(key);
  if (!png) {
    png = await renderCard({
      eyebrow: "tindone task",
      title: task.content,
      description: `List: ${task.list.toUpperCase()}`,
      footer: host,
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, png);
  }
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=300",
    },
  });
}
