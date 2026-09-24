import { css, type Handle, type RemixNode } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { backLinkStyle, pageStyle } from "../theme.ts";
import { color, font, radius } from "../tokens.ts";

/**
 * `/docs/:slug` — a Markdown document from `docs/`, converted by `@kuboon/md` ahead of time
 * (`server/docs.ts`) and handed in as a rendered tree.
 */
export function Doc(handle: Handle<{ children: RemixNode }>) {
  return () => (
    <main mix={pageStyle}>
      <a href={routes.home.href()} mix={backLinkStyle}>← Back to Home</a>
      <article mix={proseStyle}>{handle.props.children}</article>
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const proseStyle = css({
  lineHeight: 1.7,
  "& h1": { fontSize: "1.8rem", marginBottom: "12px" },
  "& h2": {
    fontSize: "1.3rem",
    marginTop: "36px",
    marginBottom: "12px",
    paddingBottom: "6px",
    borderBottom: `1px solid ${color.border}`,
  },
  "& h3": { fontSize: "1.05rem", marginTop: "24px", marginBottom: "8px" },
  "& p, & ul, & ol, & table, & pre": { marginTop: 0, marginBottom: "14px" },
  "& ul, & ol": { paddingLeft: "22px" },
  "& a": { color: color.primary },
  "& h1 a, & h2 a, & h3 a": { color: "inherit" },
  "& code": {
    fontFamily: font.mono,
    fontSize: "0.85em",
    backgroundColor: color.card,
    padding: "1px 5px",
    borderRadius: radius.sm,
  },
  "& pre": {
    padding: "12px",
    borderRadius: radius.md,
    overflowX: "auto",
    fontSize: "0.8rem",
    lineHeight: 1.5,
  },
  "& pre code": { backgroundColor: "transparent", padding: 0 },
  "& table": { borderCollapse: "collapse", width: "100%", fontSize: "0.9rem" },
  "& th, & td": {
    border: `1px solid ${color.border}`,
    padding: "6px 10px",
    textAlign: "left",
  },
  "& th": { backgroundColor: color.card },
});
