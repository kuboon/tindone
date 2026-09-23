import { css, type Handle } from "@remix-run/ui";

import { LIST_NAMES, type ListName } from "../lists.ts";
import { routes } from "../routes.ts";
import {
  backLinkStyle,
  inlineFormStyle,
  inputStyle,
  mutedStyle,
  pageStyle,
  primaryButtonStyle,
  sectionTitleStyle,
} from "../theme.ts";
import { color, radius } from "../tokens.ts";
import { ApiInst } from "../islands/api_inst.tsx";

export interface TaskView {
  id: string;
  content: string;
  list: ListName;
}

export interface LogView {
  id: string;
  from_list: ListName | null;
  to_list: ListName;
  created_at: number;
}

export interface TaskPageProps {
  task: TaskView;
  logs: LogView[];
  /**
   * The API URL for this task and the token to call it with, when the viewer owns it. A task page
   * can be opened by anyone with its link, but only the owner gets the controls.
   */
  api: { url: string; token: string } | null;
}

/** `/tasks/:taskId` — edit, move, and the history of one task. */
export function TaskPage(handle: Handle<TaskPageProps>) {
  return () => {
    const { task, logs, api } = handle.props;
    const owner = api !== null;
    const update = routes.tasks.update.href({ taskId: task.id });
    const back = task.list === "done"
      ? routes.done.href()
      : routes.swipe.href({ list: task.list });

    return (
      <main mix={pageStyle}>
        <a href={owner ? back : routes.home.href()} mix={backLinkStyle}>
          {owner ? "← Back to List" : "← tindone"}
        </a>

        <section mix={sectionStyle}>
          {owner
            ? (
              <form method="post" action={update} mix={inlineFormStyle}>
                <input
                  type="text"
                  name="content"
                  maxLength={100}
                  required
                  defaultValue={task.content}
                  mix={[inputStyle, contentInputStyle]}
                />
                <button type="submit" mix={primaryButtonStyle}>Save</button>
              </form>
            )
            : <h1 mix={contentTitleStyle}>{task.content}</h1>}
          <div mix={[mutedStyle, currentStyle]}>
            Current List:{" "}
            <strong mix={strongStyle}>{task.list.toUpperCase()}</strong>
          </div>
        </section>

        {owner
          ? (
            <section mix={sectionStyle}>
              <h2 mix={sectionTitleStyle}>Move to:</h2>
              <form method="post" action={update} mix={chipsStyle}>
                {LIST_NAMES.map((list) => (
                  <button
                    key={list}
                    type="submit"
                    name="list"
                    value={list}
                    disabled={list === task.list}
                    mix={chipStyle}
                  >
                    {list.toUpperCase()}
                  </button>
                ))}
              </form>
            </section>
          )
          : null}

        <section mix={sectionStyle}>
          <h2 mix={sectionTitleStyle}>History</h2>
          <div mix={logsStyle}>
            {logs.map((log) => (
              <div key={log.id} mix={logStyle}>
                <span>
                  {log.from_list ?? "created"} → <strong>{log.to_list}</strong>
                </span>
                <span mix={logRightStyle}>
                  <span mix={dateStyle}>
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                  {owner
                    ? (
                      <form
                        method="post"
                        action={routes.tasks.deleteLog.href({
                          taskId: task.id,
                          logId: log.id,
                        })}
                      >
                        <button type="submit" mix={deleteStyle}>Delete</button>
                      </form>
                    )
                    : null}
                </span>
              </div>
            ))}
          </div>
        </section>

        {api
          ? <ApiInst apiUrl={api.url} token={api.token} mode="update" />
          : null}
      </main>
    );
  };
}

// --- styles -----------------------------------------------------------------

const sectionStyle = css({ marginBottom: "30px" });

const contentInputStyle = css({ fontSize: "1.2rem", fontWeight: "bold" });

const contentTitleStyle = css({ fontSize: "1.6rem", wordBreak: "break-word" });

const currentStyle = css({ marginTop: "10px" });

const strongStyle = css({ color: color.fg });

const chipsStyle = css({ display: "flex", flexWrap: "wrap", gap: "10px" });

const chipStyle = css({
  padding: "8px 15px",
  borderRadius: "20px",
  backgroundColor: color.card,
  fontWeight: "bold",
  opacity: 0.7,
  "&:disabled": {
    backgroundColor: color.primary,
    color: "white",
    opacity: 1,
  },
});

const logsStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "10px",
});

const logStyle = css({
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "10px",
  padding: "10px",
  backgroundColor: color.card,
  borderRadius: radius.md,
  fontSize: "0.9rem",
});

const logRightStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "10px",
});

const dateStyle = css({ opacity: 0.5 });

const deleteStyle = css({
  color: color.primary,
  fontSize: "0.8rem",
  padding: "5px",
});
