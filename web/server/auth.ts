/**
 * Signing in with id.kbn.one, and the session cookie that remembers it.
 *
 * The IdP never talks to this server about a user. Its session is bound to a DPoP key that lives in
 * the browser (see `client/islands/_lib/session.ts`): after the `/authorize` round trip the browser
 * asks `${IDP_ORIGIN}/session` for a token — an ES256 JWS whose `sub` is the user and whose
 * `cnf.jkt` is the thumbprint of that browser key.
 *
 * The browser then hands that token to {@link signIn} as `Authorization: DPoP <jws>`, with a DPoP
 * proof for the request signed by the same key. So this server checks two things, and trusts the
 * user id only when both hold:
 *
 * 1. the token was issued by the IdP — signature against the IdP's JWKS, `iss`, `exp`, `nbf`;
 * 2. whoever sent it holds the key it is bound to — the proof verifies, is fresh, names this very
 *    request, and its key's thumbprint is the token's `cnf.jkt`.
 *
 * What it gets out of that is a plain signed cookie, which is what every server-rendered page
 * reads. Pages are ordinary document requests, and a document request cannot carry a DPoP proof.
 */

import { createCookie } from "@remix-run/cookie";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyDpopProofFromRequest } from "@kuboon/dpop/server.ts";
import { computeThumbprint } from "@kuboon/dpop/common.ts";

import { config } from "./config.ts";
import { db, now, users } from "./db.ts";
import { newId } from "./ids.ts";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const sessionCookie = createCookie("tindone_session", {
  httpOnly: true,
  sameSite: "Lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
  secrets: [...config.sessionSecrets],
});

const idpKeys = createRemoteJWKSet(
  new URL("/.well-known/jwks.json", config.idpOrigin),
);

/** A user as the rest of the server sees one. */
export interface User {
  id: string;
  apiToken: string;
}

/**
 * The signed-in user's id, from the session cookie.
 *
 * @param request Any request
 * @returns The IdP user id, or `null` when nobody is signed in
 */
export async function sessionUserId(request: Request): Promise<string | null> {
  try {
    return await sessionCookie.parse(request.headers.get("cookie"));
  } catch {
    return null;
  }
}

/**
 * The signed-in user, with their API token.
 *
 * @param request Any request
 * @returns The user, or `null` when nobody is signed in (or the account is gone)
 */
export async function currentUser(request: Request): Promise<User | null> {
  const id = await sessionUserId(request);
  if (!id) return null;
  const row = await db.find(users, id);
  return row ? { id: row.id, apiToken: row.api_token } : null;
}

/**
 * The user an API token belongs to.
 *
 * @param token The token from the URL
 * @returns The user, or `null` for a token nobody holds
 */
export async function userByToken(token: string): Promise<User | null> {
  const row = await db.findOne(users, { where: { api_token: token } });
  return row ? { id: row.id, apiToken: row.api_token } : null;
}

/** DPoP proof ids seen recently, so a captured sign-in request cannot be replayed. */
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

/** Why a sign-in was refused. */
export class SignInError extends Error {}

/**
 * Verifies an IdP token presented with a DPoP proof, and makes sure the user exists here.
 *
 * @param request `POST` carrying `Authorization: DPoP <jws>` and a `DPoP` proof
 * @returns The `Set-Cookie` value that signs the user in
 * @throws {SignInError} When the token or the proof does not check out
 */
export async function signIn(request: Request): Promise<string> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(
    " ",
  );
  if (scheme?.toLowerCase() !== "dpop" || !token) {
    throw new SignInError("missing DPoP authorization");
  }

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(token, idpKeys, {
      issuer: config.idpOrigin,
    }));
  } catch (error) {
    throw new SignInError(`invalid token: ${(error as Error).message}`);
  }
  const userId = claims.sub;
  const jkt = (claims.cnf as { jkt?: unknown } | undefined)?.jkt;
  if (!userId || typeof jkt !== "string") {
    throw new SignInError("token has no subject or key binding");
  }

  // The proof is bound to this request's URL, which a proxy in front of the server may have
  // rewritten; `RP_ORIGIN` is what the browser actually addressed.
  const url = new URL(request.url);
  const addressed = config.rpOrigin
    ? new Request(`${config.rpOrigin}${url.pathname}${url.search}`, request)
    : request;
  const proof = await verifyDpopProofFromRequest(addressed, { checkReplay });
  if (!proof.valid) throw new SignInError(`invalid DPoP proof: ${proof.error}`);
  if (await computeThumbprint(proof.jwk) !== jkt) {
    throw new SignInError("DPoP key does not match the token");
  }

  await ensureUser(userId);
  return await sessionCookie.serialize(userId, {
    secure: new URL(addressed.url).protocol === "https:",
  });
}

/** @returns The `Set-Cookie` value that signs the user out */
export async function signOut(): Promise<string> {
  return await sessionCookie.serialize("", { maxAge: 0 });
}

async function ensureUser(id: string): Promise<void> {
  if (await db.find(users, id)) return;
  await db.create(users, { id, api_token: newId(), created_at: now() });
}

/**
 * Replaces a user's API token, cutting off every script that used the old one.
 *
 * @param userId The user
 * @returns The new token
 */
export async function rotateApiToken(userId: string): Promise<string> {
  const token = newId();
  await db.update(users, userId, { api_token: token });
  return token;
}
