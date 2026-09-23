import { css, type Handle } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { backLinkStyle, mutedStyle, pageStyle } from "../theme.ts";
import { color, radius } from "../tokens.ts";

export interface DoneTask {
  id: string;
  content: string;
  updated_at: number;
}

/** `/done` — finished tasks, most recent first. */
export function Done(handle: Handle<{ tasks: DoneTask[] }>) {
  return () => (
    <main mix={pageStyle}>
      <a href={routes.home.href()} mix={backLinkStyle}>← Back to Home</a>
      <h1 mix={titleStyle}>Done Tasks</h1>
      <div mix={listStyle}>
        {handle.props.tasks.length === 0
          ? <p mix={mutedStyle}>No completed tasks yet.</p>
          : null}
        {handle.props.tasks.map((task) => (
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
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const titleStyle = css({ fontSize: "1.8rem", marginBottom: "20px" });

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
