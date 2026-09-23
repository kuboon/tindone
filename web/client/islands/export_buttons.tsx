import {
  clientEntry,
  css,
  type Handle,
  on,
  type SerializableValue,
} from "@remix-run/ui";

import { LIST_NAMES } from "../lists.ts";
import { color, radius } from "../tokens.ts";

/** What the export needs of a task — and what the JSON export contains. */
export interface ExportTask {
  id: string;
  content: string;
  list: string;
  created_at: number;
  updated_at: number;
  [key: string]: SerializableValue;
}

type Format = "markdown" | "json";

function toMarkdown(tasks: readonly ExportTask[]): string {
  const sections = LIST_NAMES.map((list) => {
    const rows = tasks.filter((task) => task.list === list);
    if (rows.length === 0) return "";
    return `## ${list.toUpperCase()}\n${
      rows.map((task) => `- ${task.content}`).join("\n")
    }`;
  }).filter(Boolean).join("\n\n");
  return sections || "# Tasks\n\n(no tasks)";
}

/** Copies every task to the clipboard, as Markdown grouped by list or as JSON. */
export const ExportButtons = clientEntry(
  import.meta.url,
  function ExportButtons(handle: Handle<{ tasks: ExportTask[] }>) {
    let copied: Format | null = null;

    const copy = async (format: Format) => {
      const tasks = handle.props.tasks;
      const text = format === "markdown"
        ? toMarkdown(tasks)
        : JSON.stringify(tasks, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        copied = format;
        handle.update();
        setTimeout(() => {
          copied = null;
          handle.update();
        }, 1200);
      } catch (error) {
        console.error(error);
      }
    };

    return () => (
      <section mix={boxStyle}>
        <h2 mix={titleStyle}>Export</h2>
        <div mix={rowStyle}>
          {(["markdown", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              mix={[buttonStyle, on("click", () => void copy(format))]}
            >
              {copied === format ? `Copied ${format}` : format}
            </button>
          ))}
        </div>
      </section>
    );
  },
);

const boxStyle = css({
  marginTop: "20px",
  padding: "20px",
  backgroundColor: color.card,
  borderRadius: radius.lg,
});

const titleStyle = css({ fontSize: "1.1rem", marginBottom: "10px" });

const rowStyle = css({ display: "flex", gap: "10px" });

const buttonStyle = css({
  padding: "8px 12px",
  borderRadius: radius.md,
  border: `1px solid ${color.muted}`,
  backgroundColor: color.bg,
  fontWeight: "bold",
});
