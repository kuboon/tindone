import { css, type Handle } from "@remix-run/ui";

import type { ListName } from "../lists.ts";
import { type DeckTask, SwipeDeck } from "../islands/swipe_deck.tsx";

export interface SwipeProps {
  tasks: DeckTask[];
  list: ListName;
  from: ListName | null;
  token: string;
}

/** `/swipe/:list` — one list as a full-screen card deck. */
export function Swipe(handle: Handle<SwipeProps>) {
  return () => (
    <main mix={mainStyle}>
      <SwipeDeck {...handle.props} />
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const mainStyle = css({
  height: "100dvh",
  width: "100vw",
  overflow: "hidden",
  backgroundColor: "#000",
  position: "relative",
});
