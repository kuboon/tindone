/**
 * Every URL the app answers, in one place.
 *
 * `server/router.tsx` maps these to what answers them, and everything that links reads
 * `routes.done.href()` rather than spelling `/done` again — a path is written once, and a rename
 * is one edit. The pages link with them, and so do the islands: this file is plain data and safe to
 * put in a browser bundle.
 *
 * Two groups:
 *
 * - **Pages** — the same HTML for everyone, prerendered by `build.ts` and served as Static Assets.
 *   Nothing in one depends on who is asking; the islands on it fetch the user's data from `api`.
 * - **`api`** — JSON. A script authorizes with its API token (`Authorization: Bearer`); the
 *   browser with id.kbn.one's token and a DPoP proof (`Authorization: DPoP`). See `server/auth.ts`.
 */

import { del, get, patch, post, route } from "@remix-run/fetch-router/routes";

export const routes = route("", {
  home: get("/"),
  swipe: get("/swipe/:list"),
  done: get("/done"),
  tasks: route("tasks", {
    /** One shell for every task: the page reads the id from its own URL. */
    show: get("/:taskId"),
  }),
  /** `docs/<slug>.md`, rendered — `/docs/api` is the API reference. */
  doc: get("/docs/:slug"),
  auth: route("auth", {
    /** Where id.kbn.one sends the browser back to after `/authorize`. */
    callback: get("/callback"),
  }),
  api: route("api", {
    /** The caller's API token. */
    me: get("/me"),
    /** Replaces the API token. */
    rotateToken: post("/me/token"),
    /** Every task the caller has. */
    all: get("/tasks"),
    /** One task and its history — anyone with the link; `owner` says whether it is the caller's. */
    task: get("/tasks/:taskId"),
    list: get("/:list"),
    create: post("/:list"),
    update: patch("/tasks/:taskId"),
    deleteLog: del("/tasks/:taskId/logs/:logId"),
  }),
  jwks: get("/.well-known/jwks.json"),
  serviceWorker: get("/sw.js"),
  manifest: get("/manifest.webmanifest"),
  static: get("/static/*path"),
});
