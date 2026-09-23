/**
 * Every URL the app answers, in one place.
 *
 * `server/router.tsx` maps these to what answers them, and everything that links reads
 * `routes.done.href()` rather than spelling `/done` again — a path is written once, and a rename
 * is one edit. The pages link with them, and so do the islands: this file is plain data and safe to
 * put in a browser bundle.
 *
 * Three groups, by who is asking:
 *
 * - **Pages and their forms** — a signed-in person, identified by the session cookie.
 * - **`auth`** — turning an id.kbn.one sign-in into that cookie, and back out.
 * - **`api`** — scripts. Addressed by the user's API token instead of a cookie, which is what
 *   makes them usable from `curl`: `POST /api/u/:token/inbox` adds a task.
 */

import { del, get, patch, post, route } from "@remix-run/fetch-router/routes";

export const routes = route("", {
  home: get("/"),
  swipe: get("/swipe/:list"),
  done: get("/done"),
  tasks: route("tasks", {
    create: post("/"),
    show: get("/:taskId"),
    update: post("/:taskId"),
    deleteLog: post("/:taskId/logs/:logId/delete"),
    /** The task's social card. */
    image: get("/:taskId/og.png"),
  }),
  rotateToken: post("/settings/api-token"),
  auth: route("auth", {
    /** Where id.kbn.one sends the browser back to after `/authorize`. */
    callback: get("/callback"),
    /** Exchanges the IdP's DPoP-bound token for the session cookie. */
    session: post("/session"),
    logout: post("/logout"),
  }),
  api: route("api/u/:token", {
    create: post("/:list"),
    update: patch("/tasks/:taskId"),
    deleteLog: del("/tasks/:taskId/logs/:logId"),
  }),
  jwks: get("/.well-known/jwks.json"),
  serviceWorker: get("/sw.js"),
  manifest: get("/manifest.webmanifest"),
  static: get("/static/*path"),
});
