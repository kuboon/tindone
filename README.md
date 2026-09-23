# tindone

Swipe your way to GTD nirvana.

## Tech Stack

- **Runtime**: [Deno](https://deno.com) 2.x
- **Framework**: [Remix v3](https://remix.run) — `@remix-run/fetch-router` + `@remix-run/ui`
  (server-rendered pages, hydrated islands). Structure follows
  [remix3-ssg-gh-pages](https://github.com/kuboon/remix3-ssg-gh-pages), served live instead of
  crawled into static files.
- **Sign-in**: [id.kbn.one](https://id.kbn.one) (passkeys, DPoP-bound sessions)
- **Push notifications**: delivered by id.kbn.one
- **Database**: Turso (libSQL) via `@remix-run/data-table` +
  [`@remix-kbn/data-table-sqlite-turso`](https://jsr.io/@remix-kbn/data-table-sqlite-turso)
- **Social cards**: drawn with Skia (`canvaskit-wasm`)

## Features

- **GTD Lists**: Inbox, Now, Next, Waiting, Done.
- **Tinder-like Swipe**: process a list as a card deck — drag or use the arrow keys. Right → Now,
  left → Next, down → Waiting, up → Done. An empty deck moves on to the next list
  (inbox → now → waiting → next → home).
- **Task Log**: every move is recorded; log lines can be deleted.
- **Remote Update**: copy a curl / wget / `fetch` snippet to add or move tasks from a terminal.
- **Push Notifications**: a move made through the API notifies your devices.
- **Export**: copy every task as Markdown or JSON.
- **Dynamic OG Image**: task URLs are shareable with a preview card.

## Layout

```
mise.toml            # `mise run build` — installs Deno, builds web/
web/
  deno.json          # workspace: members, imports, tasks, lint + fmt
  db/migrations/     # plain-SQL migrations (`deno task db migrate`)
  client/            # everything the browser is given — type-checked without deno.ns
    routes.ts        # every URL the app answers
    layout.tsx       # the document shell
    pages/           # server-rendered screens
    islands/         # hydrated client components (each file is an entrypoint)
      _lib/session.ts  # the browser's DPoP key + id.kbn.one session, shared by islands
    static/          # app.css, icons, sw.js, manifest
  server/            # the router, auth, database, push, OG images
    router.tsx       # routes → controllers; `deno serve router.tsx`
```

## How sign-in works

1. The browser creates a DPoP key (`@kuboon/dpop`, kept in IndexedDB) and goes to
   `https://id.kbn.one/authorize?dpop_jkt=<thumbprint>&redirect_uri=<origin>/auth/callback`.
2. id.kbn.one signs the user in with a passkey and binds its session to that key.
3. Back on `/auth/callback`, the browser fetches `https://id.kbn.one/session` with a DPoP proof and
   receives `{ userId, jws }` — a token whose `cnf.jkt` is the key's thumbprint.
4. It posts the token to `/auth/session` as `Authorization: DPoP <jws>` with a DPoP proof. The
   server verifies the token against id.kbn.one's JWKS and that the proof's key matches `cnf.jkt`,
   then sets a signed, HttpOnly session cookie that the pages read.

## API

Every user has an API token. The API is addressed by it, so scripts need no sign-in. The URLs are
shown on the home and task pages (and the token can be regenerated from the home page).

- `POST /api/u/:token/:list` — add a task (`list`: `inbox` / `now` / `next` / `waiting`). Body is
  the text itself (`text/plain`) or `{ "content": "…" }` (JSON). Content is 1–100 chars.
- `PATCH /api/u/:token/tasks/:taskId` — `{ "list": "done" }` and/or `{ "content": "…" }`.
  - `push` (default `true`): send a push notification for a move. `{ "list": "now", "push": false }`
    skips it; the app's own screens always do.
- `DELETE /api/u/:token/tasks/:taskId/logs/:logId` — delete one history line.

```sh
curl -X POST https://tindone.example/api/u/<token>/inbox -H "Content-Type: text/plain" -d 'buy milk'
```

## Push notifications

Subscriptions live on id.kbn.one, not here. The bell on the home page registers the device with
`https://id.kbn.one/push/*` (DPoP-bound) and `/sw.js` shows what arrives. To notify a user, the
server calls id.kbn.one's `POST /rp/notifications` with a `private_key_jwt` client assertion signed
by `RP_SIGNING_KEY_JWK`, whose public half is served at `/.well-known/jwks.json`.

The old VAPID-based notifications are gone; devices must be registered again.

## Setup

1. **id.kbn.one**: add this app's origin (`RP_ORIGIN`) to id.kbn.one's `AUTHORIZE_WHITELIST`.
   That is what allows the `/authorize` redirect back here and server-sent notifications.
2. **Environment variables**

   | Name                                   | Meaning                                                                                                          |
   | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
   | `RP_ORIGIN`                            | Public origin of this app, e.g. `https://tindone.example`. Required for push; also used for absolute URLs.        |
   | `SESSION_SECRET`                       | Secret(s) signing the session cookie, comma-separated, newest first. A dev default is used when unset.             |
   | `RP_SIGNING_KEY_JWK`                   | ES256 private key (JWK JSON) for client assertions. Generated per process when unset — set it in production.      |
   | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Turso database. Defaults to the local file `web/data/app.db`.                                                    |
   | `IDP_ORIGIN`                           | Defaults to `https://id.kbn.one`.                                                                                 |

   Generate a signing key with:

   ```sh
   deno eval 'const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]); console.log(JSON.stringify(await crypto.subtle.exportKey("jwk", k.privateKey)))'
   ```

3. **Database** — the first migration drops the old Next.js-era tables and starts empty:

   ```sh
   cd web
   deno task db migrate      # uses TURSO_DATABASE_URL / TURSO_AUTH_TOKEN
   ```

4. **Run**

   ```sh
   cd web
   deno task dev     # http://localhost:8000, with --watch
   deno task start   # production server
   deno task build   # install dependencies and compile the browser bundle (no crawl)
   deno task check   # type-check, lint, format-check
   deno task test
   ```

   Local sign-in needs `http://localhost:8000` on id.kbn.one's whitelist.
