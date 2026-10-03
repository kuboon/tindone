/**
 * Who is calling: a script with the user's API token, or the browser with id.kbn.one's token.
 *
 * Nothing here is a session. HTML is the same for everyone and cached (see `app.tsx`), so every
 * request that needs a user carries its own proof of who that is, one of two ways:
 *
 * - **`Authorization: Bearer <api_token>`** — scripts. The token is a secret in this app's
 *   database, rotatable from the home page.
 * - **`Authorization: DPoP <jws>` plus a `DPoP` proof** — the browser. The IdP's session is bound
 *   to a DPoP key that lives in the browser (see `client/islands/_lib/session.ts`), and
 *   `${IDP_ORIGIN}/session` hands it a token — an ES256 JWS whose `sub` is the user and whose
 *   `cnf.jkt` is the thumbprint of that key. The browser keeps the token until it expires and
 *   signs a fresh proof for every request, so id.kbn.one is asked again only when the token runs
 *   out. This server trusts the user id only when both hold:
 *
 *   1. the token was issued by the IdP — signature against the IdP's JWKS, `iss`, `exp`, `nbf`;
 *   2. whoever sent it holds the key it is bound to — the proof verifies, is fresh, names this
 *      very request, and its key's thumbprint is the token's `cnf.jkt`.
 *
 * Both checks are local: the JWKS is fetched once and cached, so a request costs two signature
 * verifications, not a round trip.
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyDpopProofFromRequest } from "@kuboon/dpop/server.ts";
import { computeThumbprint } from "@kuboon/dpop/common.ts";

import { config } from "./config.ts";
import { getDb, now, users } from "./db.ts";
import { newId } from "./ids.ts";

/** Built on first use: the IdP comes from the environment. */
let idpKeys: ReturnType<typeof createRemoteJWKSet> | undefined;

function keys(): ReturnType<typeof createRemoteJWKSet> {
  return idpKeys ??= createRemoteJWKSet(
    new URL("/.well-known/jwks.json", config().idpOrigin),
  );
}

/** A user as the rest of the server sees one. */
export interface User {
  id: string;
  apiToken: string;
}

/**
 * The user an API token belongs to.
 *
 * @param token The token from `Authorization: Bearer`
 * @returns The user, or `null` for a token nobody holds
 */
export async function userByToken(token: string): Promise<User | null> {
  const row = await (await getDb()).findOne(users, {
    where: { api_token: token },
  });
  return row ? { id: row.id, apiToken: row.api_token } : null;
}

/** DPoP proof ids seen recently, so a captured request cannot be replayed. */
const seenJtis = new Map<string, number>();

function checkReplay(jti: string): boolean {
  const t = Date.now();
  for (const [key, expires] of seenJtis) {
    if (expires < t) seenJtis.delete(key);
  }
  if (seenJtis.has(jti)) return false;
  seenJtis.set(jti, t + 10 * 60 * 1000);
  return true;
}

/** Why a request's credentials were refused. */
export class AuthError extends Error {}

/**
 * The user behind an `Authorization: DPoP <jws>` request, checked as described above. The first
 * request a user ever makes creates their row, with a fresh API token.
 *
 * @param request Any request carrying `Authorization: DPoP <jws>` and a `DPoP` proof
 * @returns The user
 * @throws {AuthError} When the token or the proof does not check out
 */
export async function dpopUser(request: Request): Promise<User> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    " ",
  );
  if (scheme?.toLowerCase() !== "dpop" || !token) {
    throw new AuthError("missing DPoP authorization");
  }

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, keys(), {
      issuer: config().idpOrigin,
    }));
  } catch (error) {
    throw new AuthError(`invalid token: ${(error as Error).message}`);
  }
  const userId = claims.sub;
  const jkt = (claims.cnf as { jkt?: unknown } | undefined)?.jkt;
  if (!userId || typeof jkt !== "string") {
    throw new AuthError("token has no subject or key binding");
  }

  // The proof is bound to this request's URL, which a proxy in front of the server may have
  // rewritten; `RP_ORIGIN` is what the browser actually addressed.
  const url = new URL(request.url);
  const { rpOrigin } = config();
  const addressed = rpOrigin
    ? new Request(`${rpOrigin}${url.pathname}${url.search}`, request)
    : request;
  const proof = await verifyDpopProofFromRequest(addressed, { checkReplay });
  if (!proof.valid) throw new AuthError(`invalid DPoP proof: ${proof.error}`);
  if (await computeThumbprint(proof.jwk) !== jkt) {
    throw new AuthError("DPoP key does not match the token");
  }

  return await ensureUser(userId);
}

async function ensureUser(id: string): Promise<User> {
  const db = await getDb();
  const row = await db.find(users, id);
  if (row) return { id: row.id, apiToken: row.api_token };
  const apiToken = newId();
  await db.create(users, { id, api_token: apiToken, created_at: now() });
  return { id, apiToken };
}

/**
 * Replaces a user's API token, cutting off every script that used the old one.
 *
 * @param userId The user
 * @returns The new token
 */
export async function rotateApiToken(userId: string): Promise<string> {
  const token = newId();
  await (await getDb()).update(users, userId, { api_token: token });
  return token;
}
