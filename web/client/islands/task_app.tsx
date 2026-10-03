import { clientEntry, css, type Handle } from "@remix-run/ui";

import { APP_NAME } from "../layout.tsx";
import type { ListName } from "../lists.ts";
import {
  type LogView,
  type TaskActions,
  TaskPage,
  type TaskView,
} from "../pages/task.tsx";
import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { ApiError, readJson } from "./_lib/api.ts";
import { sessionStore } from "./_lib/session.ts";

interface Loaded {
  task: TaskView;
  logs: LogView[];
  api: { url: string; token: string } | null;
}

/**
 * `/tasks/:taskId`: one shell for every task, so the id comes from the URL and the task from the
 * API. Anyone with the link sees the task and its history; a signed-in owner also gets the
 * controls, which is decided by the server (`owner` in the response) from the DPoP credential.
 */
export const TaskApp = clientEntry(
  "file://client/islands/task_app.tsx#TaskApp",
  function TaskApp(handle: Handle<{ idpOrigin: string }>) {
    let loaded: Loaded | null = null;
    let error = "";

    const taskId = () =>
      decodeURIComponent(location.pathname.split("/").pop() ?? "");

    const load = async () => {
      await sessionStore.load(handle.props.idpOrigin);
      const path = routes.api.task.href({ taskId: taskId() });
      try {
        const signedIn = Boolean(sessionStore.session.jws);
        const { task, logs, owner } = await readJson<
          { task: TaskView; logs: LogView[]; owner: boolean }
        >(signedIn ? await sessionStore.api(path) : await fetch(path));
        let api: Loaded["api"] = null;
        if (owner) {
          const { apiToken } = await readJson<{ apiToken: string }>(
            await sessionStore.api(routes.api.me.href()),
          );
          api = {
            url: new URL(
              routes.api.update.href({ taskId: task.id }),
              location.origin,
            ).href,
            token: apiToken,
          };
        }
        loaded = { task, logs, api };
        error = "";
        document.title = `${task.content} | ${APP_NAME}`;
      } catch (e) {
        error = e instanceof ApiError && e.status === 404
          ? "Task not found."
          : e instanceof Error
          ? e.message
          : String(e);
      }
      handle.update();
    };

    const send = async (path: string, init: RequestInit) => {
      await readJson(await sessionStore.api(path, init));
      await load();
    };

    const actions: TaskActions = {
      save: (content) =>
        send(routes.api.update.href({ taskId: taskId() }), patch({ content })),
      move: (list: ListName) =>
        send(routes.api.update.href({ taskId: taskId() }), patch({ list })),
      deleteLog: (logId) =>
        send(
          routes.api.deleteLog.href({ taskId: taskId(), logId }),
          { method: "DELETE" },
        ),
    };

    if (typeof document !== "undefined") void load();

    return () => {
      if (error) {
        return (
          <main mix={messageStyle}>
            <p>{error}</p>
            <a href={routes.home.href()} mix={linkStyle}>← {APP_NAME}</a>
          </main>
        );
      }
      if (!loaded) return <main mix={messageStyle} aria-busy="true"></main>;
      return <TaskPage {...loaded} actions={actions} />;
    };
  },
);

/** A move or an edit from the app's own screen: no push — the person who did it knows. */
function patch(body: Record<string, unknown>): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, push: false }),
  };
}

const messageStyle = css({
  padding: "20px",
  textAlign: "center",
  color: color.muted,
});

const linkStyle = css({ color: color.primary, fontWeight: "bold" });
