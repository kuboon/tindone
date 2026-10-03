import { css, type Handle } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { backLinkStyle, pageStyle } from "../theme.ts";
import { DoneList } from "../islands/done_list.tsx";

/** `/done` — finished tasks, most recent first. */
export function Done(handle: Handle<{ idpOrigin: string }>) {
  return () => (
    <main mix={pageStyle}>
      <a href={routes.home.href()} mix={backLinkStyle}>← Back to Home</a>
      <h1 mix={titleStyle}>Done Tasks</h1>
      <DoneList idpOrigin={handle.props.idpOrigin} />
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const titleStyle = css({ fontSize: "1.8rem", marginBottom: "20px" });
