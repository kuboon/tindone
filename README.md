# tindone

Swipe your way to GTD nirvana.

## Tech Stack

- **Runtime**: [Deno](https://deno.com) 2.x for development and builds;
  [Cloudflare Workers](https://workers.cloudflare.com) in production
- **Framework**: [Remix v3](https://remix.run) — `@remix-run/fetch-router` + `@remix-run/ui`
  (server-rendered pages, hydrated islands). Structure follows
  [remix3-ssg-gh-pages](https://github.com/kuboon/remix3-ssg-gh-pages), served live instead of
  crawled into static files.
- **Sign-in**: [id.kbn.one](https://id.kbn.one) (passkeys, DPoP-bound sessions)
- **Push notifications**: delivered by id.kbn.one
- **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) via `@remix-run/data-table` +
  [`@remix-kbn/data-table-d1`](https://jsr.io/@remix-kbn/data-table-d1)

## Features

- **GTD Lists**: Inbox, Now, Next, Waiting, Done.
- **Tinder-like Swipe**: process a list as a card deck — drag or use the arrow keys. Right → Now,
  left → Next, down → Waiting, up → Done. An empty deck moves on to the next list
  (inbox → now → waiting → next → home).
- **Task Log**: every move is recorded; log lines can be deleted.
- **Remote Update**: copy a curl / wget / `fetch` snippet to add or move tasks from a terminal.
- **Push Notifications**: a move made through the API notifies your devices.
- **Export**: copy every task as Markdown or JSON.

## Layout

```
mise.toml            # `mise run build` — installs Deno, builds web/
vercel.json          # turns off the old Vercel deployments
web/
  deno.json          # workspace: members, imports, tasks, lint + fmt
  wrangler.jsonc     # the Cloudflare Worker: entry, Static Assets, vars
  db/migrations/     # plain-SQL migrations (`deno task db migrate`)
  docs/              # Markdown served at /docs/<slug> (api.md → /docs/api)
  client/            # everything the browser is given — type-checked without deno.ns
    routes.ts        # every URL the app answers
    layout.tsx       # the document shell
    pages/           # server-rendered screens
    islands/         # hydrated client components (each file is an entrypoint)
      _lib/session.ts  # the browser's DPoP key + id.kbn.one session, shared by islands
    static/          # app.css, icons, sw.js, manifest
  server/            # auth, database, push
    app.tsx          # routes → controllers, the same on both hosts
    router.tsx       # development entry: `deno serve router.tsx`, compiles client/ on startup
    worker.ts        # Cloudflare Workers entry
    build.ts         # `deno task build`: writes dist/ for Wrangler
```

### Two hosts, one app

`server/app.tsx` is the whole app and runs unchanged on both. What differs is how each host finds
things that are not code:

|                   | `deno task dev`                          | Cloudflare Workers                                         |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Environment       | `Deno.env`                               | the Worker's `env` (`wrangler.jsonc` vars + secrets)       |
| Client bundle     | compiled on startup (`Deno.bundle`)      | prebuilt into `dist/public/assets/` + `dist/manifest.json` |
| Static files      | served by the router                     | Workers Static Assets (`dist/public/`)                     |
| Database          | `web/data/app.db` (`createLocalD1`)      | the `DB` D1 binding                                        |

Islands name themselves `file://client/islands/<name>.tsx#<Export>` in `clientEntry()` rather than
`import.meta.url`: the Worker is a single minified bundle, where every module shares one
`import.meta.url` and function names are mangled. `server/scripts.ts` resolves those ids on both
hosts.

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

Every user has an API token, sent as `Authorization: Bearer <token>`, so scripts need no sign-in.
The token and ready-to-copy snippets are shown on the home and task pages, and the token can be
regenerated from the home page.

The full reference is [`web/docs/api.md`](web/docs/api.md), served as a page at
[`/docs/api`](https://gtd.kbn.one/docs/api). Every `web/docs/<slug>.md` is converted with
[`@kuboon/md`](https://jsr.io/@kuboon/md) ahead of time — on startup in development, into
`dist/docs.json` by `deno task build` — so the Worker only renders the result.

- `GET /api/:list` — the tasks in a list (`inbox` / `now` / `next` / `waiting` / `done`).
- `POST /api/:list` — add a task (`list`: `inbox` / `now` / `next` / `waiting`). Body is the text
  itself (`text/plain`) or `{ "content": "…" }` (JSON). Content is 1–100 chars.
- `PATCH /api/tasks/:taskId` — `{ "list": "done" }` and/or `{ "content": "…" }`.
  - `push` (default `true`): send a push notification for a move. `{ "list": "now", "push": false }`
    skips it; the app's own screens always do.
- `DELETE /api/tasks/:taskId/logs/:logId` — delete one history line.

A missing or unknown token is a `401`.

```sh
curl -X POST https://gtd.kbn.one/api/inbox -H "Authorization: Bearer <token>" \
  -H "Content-Type: text/plain" -d 'buy milk'
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
2. **Environment**

   | Name                                     | Meaning                                                                                                     |
   | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
   | `RP_ORIGIN`                              | Public origin of this app, e.g. `https://tindone.example`. Required for push; also used for absolute URLs.  |
   | `SESSION_SECRET`                         | Secret(s) signing the session cookie, comma-separated, newest first. A dev default is used when unset.      |
   | `RP_SIGNING_KEY_JWK`                     | ES256 private key (JWK JSON) for client assertions. Generated per process when unset — set it in production. |
   | `DATABASE_FILE`                          | Development only: the SQLite file standing in for D1, default `web/data/app.db`. Workers use the `DB` binding. |
   | `IDP_ORIGIN`                             | Defaults to `https://id.kbn.one`.                                                                           |

   Generate a signing key with:

   ```sh
   deno eval 'const k = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]); console.log(JSON.stringify(await crypto.subtle.exportKey("jwk", k.privateKey)))'
   ```

3. **Database** — the first migration drops the old Next.js-era tables and starts empty:

   ```sh
   cd web
   deno task db migrate             # web/data/app.db, for `deno task dev`
   deno task db migrate --remote    # the D1 database; `deno task deploy` does this on every deploy
   ```

   `--remote` reads `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_D1_DATABASE_ID`
   (the `database_id` in `web/wrangler.jsonc`). Migrations are `@remix-run/data-table`'s
   (`db/migrations/<id>_<name>/up.sql`), journaled in `data_table_migrations` — not Wrangler's
   `d1 migrations`.

   D1 transactions queue their writes and commit them as one batch, so inside `transaction()` a
   write cannot return rows (use `updateMany()`, not `update()`) and a read must come before the
   first write. The local file behaves the same way, so tests catch a mistake there.

4. **Develop**

   ```sh
   cd web
   deno task dev     # http://localhost:8000, with --watch
   deno task check   # type-check, lint, format-check
   deno task test
   deno task build   # dist/ for Workers — compiles the client and bundles the Worker (no crawl)
   npx wrangler dev  # run dist/ locally in workerd; put variables in web/.dev.vars
   ```

   `wrangler dev` brings its own local D1, which starts empty. Give it the schema with
   `npx wrangler d1 execute tindone --local --file db/migrations/20260923000000_init/up.sql`.

   Local sign-in needs `http://localhost:8000` on id.kbn.one's whitelist.

## Deploy (Cloudflare Workers)

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) builds and deploys `main`
on every push, migration included; GitHub Actions only checks (`ci.yml`). Its build image has no
Deno, so the build command installs it.

One-time setup:

1. **Connect the repository**: the `tindone` Worker → Settings → Build → connect `kuboon/tindone`,
   production branch `main`, and set:

   | Setting         | Value                                                                                       |
   | --------------- | ------------------------------------------------------------------------------------------- |
   | Root directory  | `web`                                                                                       |
   | Build command   | `curl -fsSL https://deno.land/install.sh \| sh -s -- -y && $HOME/.deno/bin/deno task build` |
   | Deploy command  | `$HOME/.deno/bin/deno task deploy`                                                          |
   | Preview command | `$HOME/.deno/bin/deno task deploy:preview`                                                  |

   `deno task deploy` runs `deno task db migrate --remote` against the D1 database `tindone` (its
   id is in `web/wrangler.jsonc` and in the task), then `wrangler deploy` — the migration first,
   so new code never meets an old schema; if it fails, nothing is deployed. Both use the build's
   API token (`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, provided by Workers Builds). If the
   migration is refused for lack of permission, give that token *D1 Edit* under Settings → Build →
   API token.

   Branches other than `main` get a [Worker Preview](https://developers.cloudflare.com/workers/previews/)
   (enable Preview Builds under Branch control). `deno task deploy:preview` migrates the D1 database
   `tindone-preview`, then runs `wrangler preview`. Previews take their settings from the `previews`
   block of `web/wrangler.jsonc`, not from production: their `DB` is `tindone-preview`, shared by
   every branch. When two branches' migrations collide there, rebuild it from the branch you are
   testing: `deno task db reset --force --remote --database-id e5444ee5-209c-4e0f-8945-6fd986eba690`.
2. **Worker secrets**, from `web/` — production, and the Previews base config that every new
   Preview starts with:

   ```sh
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put RP_SIGNING_KEY_JWK
   npx wrangler preview base-config secret put SESSION_SECRET
   npx wrangler preview base-config secret put RP_SIGNING_KEY_JWK
   ```

   Signing in on a Preview needs its origin on id.kbn.one's `AUTHORIZE_WHITELIST`, and push needs
   `RP_ORIGIN`, which Previews leave unset.

3. **`RP_ORIGIN`**: set it under `vars` in `web/wrangler.jsonc` to the Worker's URL
   (`https://tindone.<subdomain>.workers.dev` or a custom domain), and add the same origin to
   id.kbn.one's `AUTHORIZE_WHITELIST`.

The Worker is about 100 KB gzipped, well within the free plan's 3 MB.
