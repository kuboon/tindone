/**
 * The GTD lists, as the screens name and color them.
 *
 * The server keeps its own list of valid names (`server/db.ts`); this is the presentation — shared
 * by pages and islands, so it holds no styling code, only values.
 */

export type ListName = "inbox" | "now" | "next" | "waiting" | "done";

export const LIST_NAMES: readonly ListName[] = [
  "inbox",
  "now",
  "next",
  "waiting",
  "done",
];

/** The lists a card deck is swiped through — `done` is a destination, not a deck. */
export const SWIPE_LISTS: readonly ListName[] = [
  "inbox",
  "now",
  "next",
  "waiting",
];

export const LIST_INFO: Record<ListName, { label: string; color: string }> = {
  inbox: { label: "Inbox", color: "#007aff" },
  now: { label: "Now", color: "#ff2d55" },
  next: { label: "Next", color: "#ffcc00" },
  waiting: { label: "Waiting", color: "#5856d6" },
  done: { label: "Done", color: "#34c759" },
};

export function isListName(value: unknown): value is ListName {
  return typeof value === "string" &&
    (LIST_NAMES as readonly string[]).includes(value);
}
