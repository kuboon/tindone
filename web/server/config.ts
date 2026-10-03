/**
 * Everything the server reads from its environment, in one place and typed.
 *
 * The app runs on two hosts: `deno serve` in development and Cloudflare Workers in production. Deno
 * has `Deno.env`; a Worker is handed its variables and secrets as the `env` of `cloudflare:workers`,
 * which `worker.ts` passes to {@link setEnv} before the first request. Nothing else names either,
 * and nothing reads the environment at import time — a Worker's bindings are not guaranteed until
 * a request arrives, so {@link config} is resolved on first use.
 */

export interface Config {
  /** id.kbn.one — where users sign in, and who delivers push notifications. */
  readonly idpOrigin: string;
  /**
   * This app's public origin. It is the `clientId` the IdP knows this app by (it has to be on the
   * IdP's `AUTHORIZE_WHITELIST`), the origin the IdP fetches `/.well-known/jwks.json` from, and the
   * base of every absolute URL the app hands out — API examples and notification links.
   * Empty means "whatever origin the request came in on", which is right for local development.
   */
  readonly rpOrigin: string;
  /** ES256 private key (JWK JSON) for the client assertions. Empty: one is generated per process. */
  readonly rpSigningKeyJwk: string;
  /** Secrets signing the session cookie, newest first (comma-separated in the environment). */
  readonly sessionSecrets: readonly string[];
  /**
   * The SQLite file standing in for D1 under `deno serve` (`DATABASE_FILE`, default
   * `web/data/app.db`). Empty on Workers, where the database is the `DB` binding.
   */
  readonly databaseFile: string;
}

type EnvSource = Record<string, unknown>;

let source: EnvSource | undefined;
let cached: Config | undefined;

/**
 * Hands the server its environment on a host without `Deno.env`.
 *
 * @param env The Worker's `env`
 */
export function setEnv(env: EnvSource): void {
  source = env;
  cached = undefined;
}

function read(key: string): string {
  const value = source
    ? source[key]
    : (globalThis as { Deno?: { env: { get(k: string): string | undefined } } })
      .Deno?.env.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function load(): Config {
  const secrets = read("SESSION_SECRET").split(",").map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length === 0) {
    // A default anyone can read would let anyone forge a session, so only development gets one.
    if (source) throw new Error("SESSION_SECRET is not set");
    console.warn(
      "SESSION_SECRET is not set; using a development secret. Set it in production.",
    );
    secrets.push("tindone-development-secret");
  }
  return {
    idpOrigin: read("IDP_ORIGIN") || "https://id.kbn.one",
    rpOrigin: read("RP_ORIGIN").replace(/\/+$/, ""),
    rpSigningKeyJwk: read("RP_SIGNING_KEY_JWK"),
    sessionSecrets: secrets,
    // Only Deno has a file to default to: in a Worker's single bundle, `import.meta.url` does not
    // resolve a relative path, and the database is the binding anyway.
    databaseFile: read("DATABASE_FILE") || (source ? "" : localDatabase()),
  };
}

/** Development's default: the same file `deno task db` migrates, `web/data/app.db`. */
function localDatabase(): string {
  return decodeURIComponent(
    new URL("../data/app.db", import.meta.url).pathname,
  );
}

/** The configuration, read from the environment on first use. */
export function config(): Config {
  return cached ??= load();
}

/**
 * The public origin for a request: `RP_ORIGIN` when configured, the request's own otherwise.
 *
 * @param request The request being answered
 * @returns An origin without a trailing slash
 */
export function publicOrigin(request: Request): string {
  return config().rpOrigin || new URL(request.url).origin;
}
