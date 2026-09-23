/**
 * The document shell.
 *
 * Every page is rendered inside it by `server/router.tsx`, through `context.render` — which streams
 * (`renderToStream`), and that matters: the client runtime turns a same-origin `<a>` click into a
 * frame navigation and only swaps the document when it finds the `rmx:flush document` marker that
 * `renderToString` would strip.
 *
 * What the shell cannot work out for itself is handed to it as a prop: where the client runtime was
 * compiled to (`script`, `null` for a page with no islands).
 *
 * `static/app.css` is linked first in `<head>` on purpose: it names the cascade layer order, and
 * layers rank by where they are first named — Remix appends its collected styles just before
 * `</head>`.
 */

import type { Handle, RemixNode } from "@remix-run/ui";

import { routes } from "./routes.ts";

/** Where the client runtime lives, and the chunks to preload behind it. */
export interface ClientRuntime {
  src: string;
  preloads: readonly string[];
}

export interface LayoutProps {
  title: string;
  description?: string;
  /**
   * The client runtime, for a page that places an island. Required, and `null` for a page with
   * none: an omitted script looks exactly like a page that needs none, and its islands would render
   * and never work.
   */
  script: ClientRuntime | null;
  children: RemixNode;
}

export const APP_NAME = "tindone";
export const TAGLINE = "Swipe your way to GTD nirvana.";

/**
 * Renders a page inside the document.
 *
 * @param handle The page's title, card, script and body
 * @returns The document
 */
export function Layout(handle: Handle<LayoutProps>) {
  return () => {
    const props = handle.props;
    return (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
          />
          <title>{props.title}</title>
          <link
            rel="stylesheet"
            href={routes.static.href({ path: "app.css" })}
          />
          <meta name="description" content={props.description ?? TAGLINE} />
          <meta name="theme-color" content="#ff4458" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-title" content={APP_NAME} />
          <link rel="manifest" href={routes.manifest.href()} />
          <link
            rel="icon"
            type="image/svg+xml"
            href={routes.static.href({ path: "icon.svg" })}
          />
          <link
            rel="apple-touch-icon"
            href={routes.static.href({ path: "icon-192.png" })}
          />
          {(props.script?.preloads ?? []).map((href) => (
            <link key={href} rel="modulepreload" href={href} />
          ))}
        </head>
        <body>
          {props.children}
          {props.script
            ? <script type="module" src={props.script.src}></script>
            : null}
        </body>
      </html>
    );
  };
}
