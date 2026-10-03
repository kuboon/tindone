import { clientEntry, css, type Handle } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color, radius } from "../tokens.ts";
import { ApiError, readJson } from "./_lib/api.ts";
import { sessionStore } from "./_lib/session.ts";

interface DoneTask {
  id: string;
  content: string;
  updated_at: number;
}

/** `/done`'s list: finished tasks, most recent first, fetched as the signed-in user. */
export const DoneList = clientEntry(
  "file://client/islands/done_list.tsx#DoneList",
  function DoneList(handle: Handle<{ idpOrigin: string }>) {
    let tasks: DoneTask[] | null = null;
    let error = "";

    const load = async () => {
      await sessionStore.load(handle.props.idpOrigin);
      try {
        ({ tasks } = await readJson<{ tasks: DoneTask[] }>(
          await sessionStore.api(routes.api.list.href({ list: "done" })),
        ));
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          location.replace(routes.home.href());
          return;
        }
        error = e instanceof Error ? e.message : String(e);
      }
      handle.update();
    };

    if (typeof document !== "undefined") void load();

    return () => {
      if (error) return <p mix={mutedStyle}>{error}</p>;
      if (!tasks) return <p mix={mutedStyle} aria-busy="true">Loading…</p>;
      return (
        <div mix={listStyle}>
          {tasks.length === 0
            ? <p mix={mutedStyle}>No completed tasks yet.</p>
            : null}
          {tasks.map((task) => (
            <a
              key={task.id}
              href={routes.tasks.show.href({ taskId: task.id })}
              mix={rowStyle}
            >
              <div mix={contentStyle}>{task.content}</div>
              <div mix={dateStyle}>
                Completed: {new Date(task.updated_at).toLocaleString()}
              </div>
            </a>
          ))}
        </div>
      );
    };
  },
);

const mutedStyle = css({ color: color.muted });

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "10px",
});

const rowStyle = css({
  display: "block",
  padding: "15px",
  backgroundColor: color.card,
  borderRadius: radius.md,
});

const contentStyle = css({ fontWeight: "bold" });

const dateStyle = css({ fontSize: "0.8rem", opacity: 0.5 });
