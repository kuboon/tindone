/**
 * The app's design tokens, as the names of the custom properties `static/app.css` defines.
 *
 * The values are not here on purpose. Light and dark swap between two palettes, which only CSS can
 * do, so `app.css` holds one copy of every token and this file holds the names.
 *
 * Islands import from here, and only from here: `theme.ts` calls `css(...)` at module scope, which
 * a bundler will not drop, so importing it would carry every shared rule into an island's chunk.
 */

export const color = {
  bg: "var(--bg)",
  fg: "var(--fg)",
  muted: "var(--muted)",
  primary: "var(--primary)",
  /** A raised-but-quiet surface: cards, list tiles, code. */
  card: "var(--card)",
  border: "var(--border)",
} as const;

export const font = {
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
} as const;

export const radius = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  pill: "999px",
} as const;

/** The measure the ordinary pages line up to. */
export const contentWidth = "var(--content-width)";
