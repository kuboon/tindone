import { css, type Handle, on } from "@remix-run/ui";

import { APP_NAME } from "../layout.tsx";
import { LIST_INFO, type ListName, SWIPE_LISTS } from "../lists.ts";
import { routes } from "../routes.ts";
import {
  inlineFormStyle,
  inputStyle,
  mutedStyle,
  pageStyle,
  primaryButtonStyle,
} from "../theme.ts";
import { color, radius } from "../tokens.ts";
import { ApiInst } from "../islands/api_inst.tsx";
import { ExportButtons, type ExportTask } from "../islands/export_buttons.tsx";
import { PushButton } from "../islands/push_button.tsx";
import { SignOut } from "../islands/sign_out.tsx";

export interface HomeProps {
  counts: Record<ListName, number>;
  tasks: ExportTask[];
  /** `POST` here adds a task to the inbox. */
  quickApiUrl: string;
  /** Sent as `Authorization: Bearer …` by scripts calling the API. */
  apiToken: string;
  idpOrigin: string;
  /** Adds a task to the inbox; rejects with a message to show. */
  onAdd: (content: string) => Promise<void>;
  onRotateToken: () => Promise<void>;
}

/**
 * `/` for a signed-in user: add a task, pick a deck, and the API. Rendered by {@link HomeApp}
 * once the user's data has arrived.
 */
export function Home(handle: Handle<HomeProps>) {
  let busy = false;
  let error = "";

  const add = async (form: HTMLFormElement) => {
    const content = String(new FormData(form).get("content") ?? "");
    busy = true;
    error = "";
    handle.update();
    try {
      await handle.props.onAdd(content);
      form.reset();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
      handle.update();
    }
  };

  return () => {
    const { counts, tasks, quickApiUrl, apiToken, idpOrigin } = handle.props;
    return (
      <main mix={pageStyle}>
        <header mix={headerStyle}>
          <h1 mix={logoStyle}>{APP_NAME}</h1>
          <div mix={bellStyle}>
            <PushButton idpOrigin={idpOrigin} />
          </div>
        </header>

        <form
          mix={[
            inlineFormStyle,
            addFormStyle,
            on("submit", (event) => {
              event.preventDefault();
              void add(event.currentTarget as HTMLFormElement);
            }),
          ]}
        >
          <input
            type="text"
            name="content"
            maxLength={100}
            required
            autocomplete="off"
            placeholder="What needs to be done?"
            mix={inputStyle}
          />
          <button type="submit" disabled={busy} mix={primaryButtonStyle}>
            Add
          </button>
        </form>
        {error ? <p mix={errorStyle}>{error}</p> : null}

        <div mix={gridStyle}>
          {SWIPE_LISTS.map((list) => (
            <a
              key={list}
              href={routes.swipe.href({ list })}
              mix={tileStyle}
            >
              <span mix={tileLabelStyle}>{LIST_INFO[list].label}</span>
              <span
                mix={tileCountStyle}
                style={{ color: LIST_INFO[list].color }}
              >
                {counts[list]}
              </span>
            </a>
          ))}
        </div>

        <section mix={apiStyle}>
          <ApiInst apiUrl={quickApiUrl} token={apiToken} mode="create" />
        </section>

        <ExportButtons tasks={tasks} />

        <div mix={footerStyle}>
          <a href={routes.done.href()} mix={mutedStyle}>
            View Done Tasks ({counts.done})
          </a>
          <details mix={tokenStyle}>
            <summary>API token</summary>
            <p>
              The API works without signing in, so anyone holding this token can
              add and move your tasks. Regenerating it stops every script using
              the old one.
            </p>
            <button
              type="button"
              mix={[
                dangerStyle,
                on("click", () => void handle.props.onRotateToken()),
              ]}
            >
              Regenerate token
            </button>
          </details>
          <SignOut idpOrigin={idpOrigin} />
        </div>
      </main>
    );
  };
}

// --- styles -----------------------------------------------------------------

const headerStyle = css({
  marginBottom: "30px",
  textAlign: "center",
  position: "relative",
});

const logoStyle = css({ fontSize: "2rem", color: color.primary });

const bellStyle = css({ position: "absolute", top: 0, right: 0 });

const addFormStyle = css({ marginBottom: "30px" });

const errorStyle = css({
  color: color.primary,
  marginTop: "-20px",
  marginBottom: "20px",
});

const gridStyle = css({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "15px",
});

const tileStyle = css({
  backgroundColor: color.card,
  padding: "20px",
  borderRadius: radius.lg,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
});

const tileLabelStyle = css({ fontSize: "1.2rem", fontWeight: "bold" });

const tileCountStyle = css({ fontSize: "2rem" });

const apiStyle = css({ marginTop: "40px" });

const footerStyle = css({
  marginTop: "20px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "14px",
  fontSize: "0.9rem",
});

const tokenStyle = css({
  color: color.muted,
  textAlign: "center",
  maxWidth: "26rem",
  "& summary": { cursor: "pointer" },
  "& p": { margin: "8px 0", fontSize: "0.8rem" },
});

const dangerStyle = css({
  color: color.primary,
  fontWeight: "bold",
  fontSize: "0.85rem",
});
