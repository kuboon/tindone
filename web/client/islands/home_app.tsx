import { clientEntry, css, type Handle } from "@remix-run/ui";

import { APP_NAME } from "../layout.tsx";
import { LIST_NAMES, type ListName } from "../lists.ts";
import { Home } from "../pages/home.tsx";
import { Landing } from "../pages/landing.tsx";
import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import type { ExportTask } from "./export_buttons.tsx";
import { ApiError, readJson } from "./_lib/api.ts";
import { sessionStore } from "./_lib/session.ts";

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "error"; message: string }
  | { kind: "ready"; tasks: ExportTask[]; apiToken: string };

/**
 * `/`: the landing page for a visitor, the home screen for a user.
 *
 * The HTML is the same for both — prerendered, and cached like any static file — so which one this
 * is gets decided here, in the browser: a stored id.kbn.one token means a user, whose tasks and API
 * token are then fetched from the API. Until then it shows only the app's name.
 */
export const HomeApp = clientEntry(
  "file://client/islands/home_app.tsx#HomeApp",
  function HomeApp(handle: Handle<{ idpOrigin: string }>) {
    let state: State = { kind: "loading" };

    const set = (next: State) => {
      state = next;
      handle.update();
    };

    const load = async () => {
      await sessionStore.load(handle.props.idpOrigin);
      if (!sessionStore.session.jws) return set({ kind: "signed-out" });
      try {
        const [{ tasks }, { apiToken }] = await Promise.all([
          sessionStore.api(routes.api.all.href()).then((response) =>
            readJson<{ tasks: ExportTask[] }>(response)
          ),
          sessionStore.api(routes.api.me.href()).then((response) =>
            readJson<{ apiToken: string }>(response)
          ),
        ]);
        set({ kind: "ready", tasks, apiToken });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          return set({ kind: "signed-out" });
        }
        set({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    const add = async (content: string) => {
      await readJson(
        await sessionStore.api(routes.api.create.href({ list: "inbox" }), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content }),
        }),
      );
      await load();
    };

    const rotateToken = async () => {
      const { apiToken } = await readJson<{ apiToken: string }>(
        await sessionStore.api(routes.api.rotateToken.href(), {
          method: "POST",
        }),
      );
      if (state.kind === "ready") set({ ...state, apiToken });
    };

    if (typeof document !== "undefined") void load();

    return () => {
      switch (state.kind) {
        case "loading":
          return (
            <main mix={splashStyle}>
              <h1 mix={logoStyle}>{APP_NAME}</h1>
            </main>
          );
        case "signed-out":
          return <Landing idpOrigin={handle.props.idpOrigin} />;
        case "error":
          return (
            <main mix={splashStyle}>
              <h1 mix={logoStyle}>{APP_NAME}</h1>
              <p>{state.message}</p>
            </main>
          );
        case "ready": {
          const counts = Object.fromEntries(
            LIST_NAMES.map((list) => [list, 0]),
          ) as Record<ListName, number>;
          for (const task of state.tasks) counts[task.list as ListName]++;
          return (
            <Home
              counts={counts}
              tasks={state.tasks}
              quickApiUrl={new URL(
                routes.api.create.href({ list: "inbox" }),
                location.origin,
              ).href}
              apiToken={state.apiToken}
              idpOrigin={handle.props.idpOrigin}
              onAdd={add}
              onRotateToken={rotateToken}
            />
          );
        }
      }
    };
  },
);

const splashStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1rem",
  minHeight: "100vh",
  padding: "20px",
  textAlign: "center",
});

const logoStyle = css({
  fontSize: "4rem",
  color: color.primary,
  fontWeight: 900,
  letterSpacing: "-2px",
});
