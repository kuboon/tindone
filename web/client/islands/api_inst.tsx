import {
  clientEntry,
  css,
  type Handle,
  on,
  type SerializableValue,
} from "@remix-run/ui";

import { color, font, radius } from "../tokens.ts";

const TABS = ["curl", "wget", "fetch"] as const;
type Tab = (typeof TABS)[number];

export interface ApiInstProps {
  /** Absolute endpoint URL, API token included. */
  apiUrl: string;
  /** `create`: add a task to a list. `update`: move the task this page shows. */
  mode: "create" | "update";
  [key: string]: SerializableValue;
}

/**
 * The same API call three ways — curl, wget and `fetch` — with a copy button.
 *
 * The URL carries the user's API token, which is what lets a script call it without signing in.
 */
export const ApiInst = clientEntry(
  "file://client/islands/api_inst.tsx#ApiInst",
  function ApiInst(handle: Handle<ApiInstProps>) {
    let tab: Tab = "curl";
    let copied = false;

    const snippet = (): string => {
      const url = handle.props.apiUrl;
      if (handle.props.mode === "create") {
        return {
          curl:
            `curl -X POST ${url} -H "Content-Type: text/plain" -d 'buy milk'`,
          wget:
            `wget --method=POST --body-data='buy milk' --header="Content-Type: text/plain" ${url}`,
          fetch: `await fetch("${url}", {
  method: "POST",
  headers: { "Content-Type": "text/plain" },
  body: "buy milk",
});`,
        }[tab];
      }
      return {
        curl:
          `curl -X PATCH ${url} -H "Content-Type: application/json" -d '{"list":"done"}'`,
        wget:
          `wget --method=PATCH --body-data='{"list":"done"}' --header="Content-Type: application/json" ${url}`,
        fetch: `await fetch("${url}", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ list: "done" }),
});`,
      }[tab];
    };

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(snippet());
        copied = true;
        handle.update();
        setTimeout(() => {
          copied = false;
          handle.update();
        }, 1200);
      } catch (error) {
        console.error(error);
      }
    };

    return () => (
      <section mix={boxStyle}>
        <div mix={headStyle}>
          <h2 mix={titleStyle}>API</h2>
          <button
            type="button"
            mix={[copyStyle, on("click", () => void copy())]}
            style={{ color: copied ? color.primary : color.muted }}
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <div mix={tabsStyle}>
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              mix={[
                tabStyle,
                on("click", () => {
                  tab = name;
                  handle.update();
                }),
              ]}
              style={tab === name
                ? { backgroundColor: color.primary, color: "white" }
                : { backgroundColor: color.bg, color: color.fg }}
            >
              {name}
            </button>
          ))}
        </div>
        <code mix={codeStyle}>{snippet()}</code>
        {handle.props.mode === "update"
          ? (
            <p mix={noteStyle}>
              Add <code>"push": false</code>{" "}
              to the body to suppress push notifications.
            </p>
          )
          : null}
      </section>
    );
  },
);

const boxStyle = css({
  padding: "20px",
  backgroundColor: color.card,
  borderRadius: radius.lg,
  border: `1px dashed ${color.muted}`,
});

const headStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "10px",
});

const titleStyle = css({ fontSize: "1rem" });

const copyStyle = css({ fontWeight: "bold", fontSize: "0.8rem" });

const tabsStyle = css({ display: "flex", gap: "8px", marginBottom: "12px" });

const tabStyle = css({
  padding: "6px 12px",
  borderRadius: radius.pill,
  border: `1px solid ${color.muted}`,
  fontSize: "0.8rem",
  fontWeight: "bold",
});

const codeStyle = css({
  fontFamily: font.mono,
  fontSize: "0.75rem",
  display: "block",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  backgroundColor: color.bg,
  padding: "10px",
  borderRadius: radius.sm,
});

const noteStyle = css({
  marginTop: "8px",
  fontSize: "0.75rem",
  color: color.muted,
});
