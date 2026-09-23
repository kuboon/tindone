import {
  clientEntry,
  css,
  type Handle,
  navigate,
  on,
  ref,
  type SerializableValue,
} from "@remix-run/ui";

import type { ListName } from "../lists.ts";
import { routes } from "../routes.ts";
import { color, radius } from "../tokens.ts";

type Direction = "right" | "left" | "up" | "down";

export interface DeckTask {
  id: string;
  content: string;
  [key: string]: SerializableValue;
}

export interface SwipeDeckProps {
  tasks: DeckTask[];
  list: ListName;
  /** The list the user swiped through just before this one, for the entrance animation. */
  from: ListName | null;
  /** The user's API token: moves go through the same API a script would use. */
  token: string;
  [key: string]: SerializableValue;
}

/** Where a swipe sends a card, by the list it is in. Up is always done. */
const TARGETS: Record<string, Record<Exclude<Direction, "up">, ListName>> = {
  inbox: { right: "now", left: "next", down: "waiting" },
  now: { right: "now", left: "next", down: "waiting" },
  waiting: { right: "now", left: "next", down: "waiting" },
  next: { right: "now", left: "next", down: "waiting" },
};

/** What a hint says: a swipe back into the card's own list sends it to the end of the stack. */
function label(list: ListName, direction: Direction): string {
  if (direction === "up") return "DONE";
  const target = TARGETS[list]![direction];
  const name = target === "waiting" ? "WAIT" : target.toUpperCase();
  return target === list ? `RE-${name}` : name;
}

/** The deck after this one, once it is empty. `null`: back home. */
const NEXT_DECK: Partial<Record<ListName, ListName>> = {
  inbox: "now",
  now: "waiting",
  waiting: "next",
};

/** Where the whole deck slides in from, as a percentage of its size. */
const ENTRANCE: Partial<Record<ListName, [number, number]>> = {
  now: [120, 0],
  next: [-120, 0],
  waiting: [0, 120],
  inbox: [0, -120],
};

const THRESHOLD = 100;
const HINT_BASE = 0.15;

const HINTS: Record<
  Direction,
  { color: string; place: Record<string, string> }
> = {
  right: {
    color: "#4caf50",
    place: { right: "20px", top: "50%", transform: "translateY(-50%)" },
  },
  left: {
    color: "#f44336",
    place: { left: "20px", top: "50%", transform: "translateY(-50%)" },
  },
  up: {
    color: "#2196f3",
    place: { top: "20px", left: "50%", transform: "translateX(-50%)" },
  },
  down: {
    color: "#9c27b0",
    place: { bottom: "20px", left: "50%", transform: "translateX(-50%)" },
  },
};

function isUrl(content: string): boolean {
  return /^https?:\/\/\S+$/.test(content.trim());
}

/**
 * The Tinder-style card stack for one list.
 *
 * Drag a card — or press an arrow key — right, left, down or up to move it; the card flies off,
 * the next one is already there, and the move is sent in the background. When the deck runs out
 * it moves on to the next list (inbox → now → waiting → next → home), and the next deck slides in
 * from the side its cards were swiped to.
 *
 * Dragging writes the card's transform straight to the element instead of re-rendering on every
 * pointer move; a re-render only happens when a card is committed.
 */
export const SwipeDeck = clientEntry(
  import.meta.url,
  function SwipeDeck(handle: Handle<SwipeDeckProps>) {
    let index = 0;
    let busy = false;
    let card: HTMLElement | null = null;
    let drag: { id: number; x0: number; y0: number; moved: boolean } | null =
      null;

    const list = () => handle.props.list;
    const tasks = () => handle.props.tasks;

    const setPose = (x: number, y: number) => {
      if (!card) return;
      const rotate = Math.max(-25, Math.min(25, (x / 200) * 25));
      card.style.transform = `translate(${x}px, ${y}px) rotate(${rotate}deg)`;
      const amounts: Record<Direction, number> = {
        right: x,
        left: -x,
        up: -y,
        down: y,
      };
      for (const hint of card.querySelectorAll<HTMLElement>("[data-hint]")) {
        const amount = amounts[hint.dataset.hint as Direction] ?? 0;
        hint.style.opacity = String(
          Math.min(
            1,
            Math.max(
              HINT_BASE,
              HINT_BASE + (amount / THRESHOLD) * (1 - HINT_BASE),
            ),
          ),
        );
      }
    };

    const nextDeck = () => {
      const next = NEXT_DECK[list()];
      void navigate(
        next
          ? `${routes.swipe.href({ list: next })}?from=${list()}`
          : routes.home.href(),
      );
    };

    const commit = (direction: Direction) => {
      const task = tasks()[index];
      if (!task) return;
      const target = direction === "up" ? "done" : TARGETS[list()]![direction];
      fetch(
        routes.api.update.href({ token: handle.props.token, taskId: task.id }),
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ list: target, push: false }),
        },
      ).catch((error) => console.error(error));

      index++;
      busy = false;
      if (index >= tasks().length) nextDeck();
      else handle.update();
    };

    const flyOut = async (direction: Direction) => {
      if (!card || busy) return;
      busy = true;
      const from = card.style.transform || "none";
      const to = {
        right: "translate(520px, 0) rotate(20deg)",
        left: "translate(-520px, 0) rotate(-20deg)",
        up: "translate(0, -520px)",
        down: "translate(0, 520px)",
      }[direction];
      const animation = card.animate(
        [{ transform: from }, { transform: to }],
        { duration: 220, easing: "ease-out", fill: "forwards" },
      );
      await animation.finished.catch(() => {});
      commit(direction);
    };

    const snapBack = () => {
      if (!card) return;
      const from = card.style.transform || "none";
      setPose(0, 0);
      card.animate([{ transform: from }, { transform: "none" }], {
        duration: 180,
        easing: "ease-out",
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      if (busy || event.button !== 0) return;
      drag = {
        id: event.pointerId,
        x0: event.clientX,
        y0: event.clientY,
        moved: false,
      };
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const x = event.clientX - drag.x0;
      const y = event.clientY - drag.y0;
      if (Math.abs(x) > 5 || Math.abs(y) > 5) drag.moved = true;
      setPose(x, y);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      const x = event.clientX - drag.x0;
      const y = event.clientY - drag.y0;
      const moved = drag.moved;
      drag = null;
      // A tap on the card is a click on its link; a drag is not.
      if (moved) {
        card?.addEventListener("click", (e) => e.preventDefault(), {
          once: true,
          capture: true,
        });
      }
      if (x > THRESHOLD) void flyOut("right");
      else if (x < -THRESHOLD) void flyOut("left");
      else if (y < -THRESHOLD) void flyOut("up");
      else if (y > THRESHOLD) void flyOut("down");
      else snapBack();
    };

    if (typeof document !== "undefined") {
      document.addEventListener("keydown", (event) => {
        const active = document.activeElement;
        if (
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active instanceof HTMLSelectElement ||
          (active as HTMLElement | null)?.isContentEditable
        ) return;
        const direction = ({
          ArrowRight: "right",
          ArrowLeft: "left",
          ArrowUp: "up",
          ArrowDown: "down",
        } as Record<string, Direction>)[event.key];
        if (!direction || !tasks()[index]) return;
        event.preventDefault();
        void flyOut(direction);
      }, { signal: handle.signal });
    }

    /**
     * Slides the whole deck in from where the previous one's cards went — once per deck. Moving to
     * the next deck is a frame navigation that hands this same island new props rather than a new
     * island, so "once" is tracked here and reset when a new deck arrives.
     */
    let deck: Element | null = null;
    let entered = false;
    let seen = handle.props.tasks;

    const enter = () => {
      if (entered || !deck) return;
      entered = true;
      const offset = handle.props.from && handle.props.from !== list()
        ? ENTRANCE[list()]
        : undefined;
      if (!offset) return;
      deck.animate([
        {
          transform: `translate(${offset[0]}%, ${offset[1]}%)`,
          opacity: 0.8,
        },
        { transform: "none", opacity: 1 },
      ], { duration: 450, easing: "cubic-bezier(0.2, 0.9, 0.3, 1.1)" });
    };

    return () => {
      if (handle.props.tasks !== seen) {
        seen = handle.props.tasks;
        index = 0;
        busy = false;
        entered = false;
        handle.queueTask(enter);
      }
      const task = tasks()[index];
      const home = routes.home.href();

      if (!task) {
        return (
          <div mix={emptyStyle}>
            <h2>No more tasks in {list()}</h2>
            <div mix={emptyLinksStyle}>
              <a href={home} mix={accentLinkStyle}>← back to home</a>
              <button
                type="button"
                mix={[accentLinkStyle, on("click", nextDeck)]}
              >
                Next List →
              </button>
            </div>
          </div>
        );
      }

      const url = isUrl(task.content) ? task.content.trim() : null;
      return (
        <div
          mix={[
            deckStyle,
            ref((node, signal) => {
              deck = node;
              signal.addEventListener("abort", () => {
                if (deck === node) deck = null;
              });
              enter();
            }),
          ]}
        >
          <div mix={[ghostStyle, ghostNearStyle]} />
          <div mix={[ghostStyle, ghostFarStyle]} />
          <div
            key={task.id}
            mix={[
              cardStyle,
              ref((node, signal) => {
                card = node as HTMLElement;
                const listen = (
                  type: string,
                  listener: (event: PointerEvent) => void,
                ) =>
                  node.addEventListener(
                    type,
                    (event) => listener(event as PointerEvent),
                    { signal },
                  );
                listen("pointerdown", onPointerDown);
                listen("pointermove", onPointerMove);
                listen("pointerup", onPointerUp);
                listen("pointercancel", () => {
                  drag = null;
                  snapBack();
                });
              }),
            ]}
          >
            <a
              href={url ?? routes.tasks.show.href({ taskId: task.id })}
              target={url ? "_blank" : undefined}
              rel={url ? "noopener noreferrer" : undefined}
              draggable={false}
              mix={cardLinkStyle}
            >
              <h2 mix={url ? [contentStyle, urlStyle] : contentStyle}>
                {url ? `🔗 ${task.content}` : task.content}
              </h2>
            </a>
            {(["right", "left", "up", "down"] as const).map((direction) => (
              <div
                key={direction}
                data-hint={direction}
                mix={hintStyle}
                style={{
                  ...HINTS[direction].place,
                  color: HINTS[direction].color,
                  borderColor: HINTS[direction].color,
                  opacity: String(HINT_BASE),
                }}
              >
                {label(list(), direction)}
              </div>
            ))}
          </div>
          <a href={home} mix={homeLinkStyle}>← Home</a>
          <div mix={counterStyle}>
            {list().toUpperCase()} ({index + 1}/{tasks().length})
          </div>
        </div>
      );
    };
  },
);

const deckStyle = css({
  position: "relative",
  height: "100%",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const cardShape = {
  position: "absolute",
  width: "90%",
  maxWidth: "400px",
  height: "70%",
  borderRadius: "20px",
} as const;

const ghostStyle = css(cardShape);

const ghostNearStyle = css({
  backgroundColor: "rgba(255,255,255,0.12)",
  transform: "translateY(12px) scale(0.97)",
  zIndex: 1,
});

const ghostFarStyle = css({
  backgroundColor: "rgba(255,255,255,0.08)",
  transform: "translateY(24px) scale(0.94)",
  zIndex: 0,
});

const cardStyle = css({
  ...cardShape,
  backgroundColor: "white",
  padding: "30px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
  cursor: "grab",
  zIndex: 10,
  touchAction: "none",
  userSelect: "none",
  "&:active": { cursor: "grabbing" },
});

const cardLinkStyle = css({
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

const contentStyle = css({
  fontSize: "1.5rem",
  textAlign: "center",
  color: "#111",
  wordBreak: "break-word",
});

const urlStyle = css({ wordBreak: "break-all" });

const hintStyle = css({
  position: "absolute",
  fontWeight: "bold",
  fontSize: "2rem",
  border: "4px solid",
  padding: "10px",
  borderRadius: radius.md,
  pointerEvents: "none",
});

const homeLinkStyle = css({
  position: "absolute",
  top: "20px",
  left: "20px",
  color: "white",
  opacity: 0.7,
});

const counterStyle = css({
  position: "absolute",
  top: "20px",
  right: "20px",
  color: "white",
  fontWeight: "bold",
});

const emptyStyle = css({
  color: "white",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
});

const emptyLinksStyle = css({
  marginTop: "20px",
  display: "flex",
  alignItems: "center",
  gap: "16px",
});

const accentLinkStyle = css({ color: color.primary, fontWeight: "bold" });
