/**
 * The `css(...)` mixins more than one page uses.
 *
 * The server collects the mixins a page rendered and writes them into its `<head>`, so each page
 * ships its own CSS and nothing else. A style used in one place belongs in that file, under its
 * `// --- styles ---` heading. Islands take values from `tokens.ts` instead of importing this.
 */

import { css } from "@remix-run/ui";

import { color, contentWidth, radius } from "./tokens.ts";

/** The column an ordinary page is laid out in. */
export const pageStyle = css({
  padding: "20px",
  maxWidth: contentWidth,
  margin: "0 auto",
});

/** "← Back to …" at the top of a page. */
export const backLinkStyle = css({
  display: "inline-block",
  marginBottom: "20px",
  color: color.primary,
  fontWeight: "bold",
});

/** The filled pink call to action. */
export const primaryButtonStyle = css({
  backgroundColor: color.primary,
  color: "white",
  padding: "10px 20px",
  borderRadius: radius.md,
  fontWeight: "bold",
  "&:disabled": { opacity: 0.6 },
});

/** A one-line text field. */
export const inputStyle = css({
  flex: 1,
  minWidth: 0,
  padding: "12px 15px",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  fontSize: "1rem",
});

/** A field and its button side by side. */
export const inlineFormStyle = css({ display: "flex", gap: "10px" });

/** A quiet raised block: a list tile, a log line, a panel. */
export const surfaceStyle = css({
  backgroundColor: color.card,
  borderRadius: radius.lg,
  padding: "20px",
});

export const sectionTitleStyle = css({
  fontSize: "1.2rem",
  marginBottom: "15px",
});

export const mutedStyle = css({ color: color.muted });
