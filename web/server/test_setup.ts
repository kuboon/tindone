/**
 * The environment every server test runs in: a throwaway database with the real migrations
 * applied, and a stand-in IdP publishing a JWKS on a local port.
 *
 * Import it before anything that reads `config.ts`, which reads the environment once, on first use.
 */

import { exportJWK, generateKeyPair, SignJWT } from "jose";

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
Deno.env.set("SESSION_SECRET", "test-secret");
// A throwaway file rather than `:memory:`: libSQL's client opens a fresh connection after each
// transaction, and a fresh in-memory connection is a fresh, empty database.
const dbDir = await Deno.makeTempDir({ prefix: "tindone-test-" });
Deno.env.set("TURSO_DATABASE_URL", `file:${dbDir}/test.db`);

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

/** Lets the test runner exit: the stand-in IdP is the only thing keeping it alive. */
export async function shutdown(): Promise<void> {
  await idp.shutdown();
  await Deno.remove(dbDir, { recursive: true }).catch(() => {});
}
