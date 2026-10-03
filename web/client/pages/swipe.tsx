import { css, type Handle } from "@remix-run/ui";

import type { ListName } from "../lists.ts";
import { SwipeDeck } from "../islands/swipe_deck.tsx";

export interface SwipeProps {
  list: ListName;
  idpOrigin: string;
}

/** `/swipe/:list` — one list as a full-screen card deck. The deck fetches its own cards. */
export function Swipe(handle: Handle<SwipeProps>) {
  return () => (
    <main mix={mainStyle}>
      <SwipeDeck list={handle.props.list} idpOrigin={handle.props.idpOrigin} />
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
