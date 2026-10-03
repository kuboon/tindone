import { css, type Handle, on } from "@remix-run/ui";

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

/** What the owner can do to the task. Each rejects with a message to show. */
export interface TaskActions {
  save(content: string): Promise<void>;
  move(list: ListName): Promise<void>;
  deleteLog(logId: string): Promise<void>;
}

export interface TaskPageProps {
  task: TaskView;
  logs: LogView[];
  /**
   * The API URL for this task and the token to call it with, when the viewer owns it. A task page
   * can be opened by anyone with its link, but only the owner gets the controls.
   */
  api: { url: string; token: string } | null;
  actions: TaskActions;
}

/**
 * `/tasks/:taskId` — edit, move, and the history of one task. Rendered by {@link TaskApp} once the
 * task has been fetched.
 */
export function TaskPage(handle: Handle<TaskPageProps>) {
  let error = "";

  const run = async (action: () => Promise<void>) => {
    error = "";
    try {
      await action();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    handle.update();
  };

  return () => {
    const { task, logs, api, actions } = handle.props;
    const owner = api !== null;
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
              <form
                mix={[
                  inlineFormStyle,
                  on("submit", (event) => {
                    event.preventDefault();
                    const form = event.currentTarget as HTMLFormElement;
                    const content = String(
                      new FormData(form).get("content") ?? "",
                    );
                    void run(() => actions.save(content));
                  }),
                ]}
              >
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
          {error ? <p mix={errorStyle}>{error}</p> : null}
          <div mix={[mutedStyle, currentStyle]}>
            Current List:{" "}
            <strong mix={strongStyle}>{task.list.toUpperCase()}</strong>
          </div>
        </section>

        {owner
          ? (
            <section mix={sectionStyle}>
              <h2 mix={sectionTitleStyle}>Move to:</h2>
              <div mix={chipsStyle}>
                {LIST_NAMES.map((list) => (
                  <button
                    key={list}
                    type="button"
                    disabled={list === task.list}
                    mix={[
                      chipStyle,
                      on("click", () => void run(() => actions.move(list))),
                    ]}
                  >
                    {list.toUpperCase()}
                  </button>
                ))}
              </div>
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
                      <button
                        type="button"
                        mix={[
                          deleteStyle,
                          on(
                            "click",
                            () => void run(() => actions.deleteLog(log.id)),
                          ),
                        ]}
                      >
                        Delete
                      </button>
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

const errorStyle = css({ color: color.primary, marginTop: "10px" });

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
