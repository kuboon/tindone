/**
 * The environment every server test runs in: a throwaway database with the real migrations
 * applied, and a stand-in IdP publishing a JWKS on a local port.
 *
 * Import it before anything that reads `config.ts`, which reads the environment once, on first use.
 */

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { init, InMemoryKeyRepository } from "@kuboon/dpop";

const idpKeys = await generateKeyPair("ES256", { extractable: true });
const idpJwk = {
  ...await exportJWK(idpKeys.publicKey),
  kid: "test",
  alg: "ES256",
};

const idp = Deno.serve(
  { port: 0, onListen() {} },
  (request) =>
    new URL(request.url).pathname === "/.well-known/jwks.json"
      ? Response.json({ keys: [idpJwk] })
      : new Response("Not Found", { status: 404 }),
);

export const IDP_ORIGIN = `http://localhost:${idp.addr.port}`;
export const RP_ORIGIN = "http://rp.test";

Deno.env.set("IDP_ORIGIN", IDP_ORIGIN);
Deno.env.set("RP_ORIGIN", RP_ORIGIN);
// One connection for the whole run, so an in-memory database lives as long as the tests do.
Deno.env.set("DATABASE_FILE", ":memory:");

const db = await (await import("./db.ts")).getDb();
for await (
  const dir of Deno.readDir(new URL("../db/migrations/", import.meta.url))
) {
  const sql = await Deno.readTextFile(
    new URL(`../db/migrations/${dir.name}/up.sql`, import.meta.url),
  );
  await db.executeScript(sql);
}

/**
 * Signs a token the way id.kbn.one's `/session` does.
 *
 * @param claims `sub` and `cnf.jkt`, plus anything to override
 */
export async function idpToken(
  claims: Record<string, unknown>,
  issuer = IDP_ORIGIN,
): Promise<string> {
  const iat = Math.floor(Date.now() / 1000);
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "ES256", kid: "test" })
    .setIssuer(issuer)
    .setNotBefore(iat)
    .setExpirationTime(iat + 3600)
    .setJti(crypto.randomUUID())
    .sign(idpKeys.privateKey);
}

/**
 * A browser: its own DPoP key, and the request an island would send with it — captured rather
 * than sent, so a test hands it to whatever it is testing.
 */
export async function browser() {
  let captured: Request | undefined;
  const { fetchDpop, thumbprint } = await init({
    keyStore: new InMemoryKeyRepository(),
    fetch: (input, requestInit) => {
      captured = new Request(input, requestInit);
      return Promise.resolve(new Response(null));
    },
  });
  /**
   * @param token id.kbn.one's token, sent as `Authorization: DPoP <token>`
   * @param path Where on this app the request goes
   * @param init Method and body
   */
  const request = async (
    token: string,
    path = "/api/me",
    init: RequestInit = {},
  ) => {
    await fetchDpop(`${RP_ORIGIN}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `DPoP ${token}` },
    });
    return captured!;
  };
  return { thumbprint, request };
}

/** Lets the test runner exit: the stand-in IdP is the only thing keeping it alive. */
export async function shutdown(): Promise<void> {
  await idp.shutdown();
}
