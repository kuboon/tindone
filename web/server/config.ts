/**
 * Everything this server reads from its environment, in one place and typed.
 *
 * Read once at startup: a missing value is either given a development default here or reported
 * where it is first needed, so the rest of the server never names `Deno.env`.
 */

export interface Config {
  /** id.kbn.one — where users sign in, and who delivers push notifications. */
  readonly idpOrigin: string;
  /**
   * This app's public origin. It is the `clientId` the IdP knows this app by (it has to be on the
   * IdP's `AUTHORIZE_WHITELIST`), the origin the IdP fetches `/.well-known/jwks.json` from, and the
   * base of every absolute URL the app hands out — API examples, `og:image`, notification links.
   * Empty means "whatever origin the request came in on", which is right for local development.
   */
  readonly rpOrigin: string;
  /** ES256 private key (JWK JSON) for the client assertions. Empty: one is generated per process. */
  readonly rpSigningKeyJwk: string;
  /** Secrets signing the session cookie, newest first (comma-separated in the environment). */
  readonly sessionSecrets: readonly string[];
  /** libSQL URL: `libsql://…` for Turso, `file:…` for a local database. */
  readonly databaseUrl: string;
  readonly databaseAuthToken: string;
}

function load(): Config {
  const env = (key: string) => Deno.env.get(key)?.trim() ?? "";
  const secrets = env("SESSION_SECRET").split(",").map((s) => s.trim())
    .filter(Boolean);
  if (secrets.length === 0) {
    console.warn(
      "SESSION_SECRET is not set; using a development secret. Set it in production.",
    );
    secrets.push("tindone-development-secret");
  }
  return {
    idpOrigin: env("IDP_ORIGIN") || "https://id.kbn.one",
    rpOrigin: env("RP_ORIGIN").replace(/\/+$/, ""),
    rpSigningKeyJwk: env("RP_SIGNING_KEY_JWK"),
    sessionSecrets: secrets,
    databaseUrl: env("TURSO_DATABASE_URL") ||
      // The same file `deno task db` migrates by default: `web/data/app.db`.
      `file:${
        decodeURIComponent(new URL("../data/app.db", import.meta.url).pathname)
      }`,
    databaseAuthToken: env("TURSO_AUTH_TOKEN"),
  };
}

export const config: Config = load();

/**
 * The public origin for a request: `RP_ORIGIN` when configured, the request's own otherwise.
 *
 * @param request The request being answered
 * @returns An origin without a trailing slash
 */
export function publicOrigin(request: Request): string {
  return config.rpOrigin || new URL(request.url).origin;
}
