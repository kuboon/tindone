/**
 * Server-initiated push notifications, delivered by id.kbn.one.
 *
 * Subscriptions are not stored here: the browser registers them with the IdP directly (see
 * `client/islands/push_button.tsx`). To notify a user this server calls the IdP's
 * `POST /rp/notifications`, authenticated with a `private_key_jwt` client assertion (RFC 7521 /
 * RFC 7523) signed by this app's ES256 key. The IdP checks it against the public key this app
 * publishes at `/.well-known/jwks.json` ({@link jwks}) — no shared secret.
 *
 * The app's `clientId` is its origin, `RP_ORIGIN`, which has to be on the IdP's
 * `AUTHORIZE_WHITELIST`; the IdP only delivers to subscriptions registered from that origin.
 */

import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from "jose";

import { config } from "./config.ts";

interface SigningKey {
  privateKey: CryptoKey;
  kid: string;
  publicJwk: JsonWebKey & { kid: string; use: "sig"; alg: "ES256" };
}

let signingKey: Promise<SigningKey> | undefined;

/**
 * The app's signing key: `RP_SIGNING_KEY_JWK` when set, otherwise one generated per process —
 * fine for development, and the reason production has to set it: the IdP caches the JWKS, and a key
 * that changes on every restart would not match it.
 */
function getSigningKey(): Promise<SigningKey> {
  return signingKey ??= (async () => {
    let privateKey: CryptoKey;
    let publicJwk: JsonWebKey;
    const { rpSigningKeyJwk } = config();
    if (rpSigningKeyJwk) {
      const jwk = JSON.parse(rpSigningKeyJwk) as JsonWebKey;
      privateKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
      const { d: _d, ...rest } = jwk;
      publicJwk = rest;
    } else {
      const pair = await generateKeyPair("ES256", { extractable: true });
      privateKey = pair.privateKey as CryptoKey;
      publicJwk = await exportJWK(pair.publicKey);
    }
    const { kty, crv, x, y } = publicJwk;
    const kid = await calculateJwkThumbprint({ kty, crv, x, y });
    return {
      privateKey,
      kid,
      publicJwk: { kty, crv, x, y, kid, use: "sig", alg: "ES256" },
    };
  })();
}

/**
 * `GET /.well-known/jwks.json`.
 *
 * @returns The JWKS the IdP verifies client assertions against
 */
export async function jwks(): Promise<Response> {
  const { publicJwk } = await getSigningKey();
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    headers: {
      "content-type": "application/jwk-set+json",
      "cache-control": "public, max-age=3600",
      "access-control-allow-origin": "*",
    },
  });
}

/** What a notification says — the IdP's `pushNotificationContentSchema`. */
export interface Notification {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  badgeCount?: number;
}

/** One device's delivery, as the IdP reports it. */
export interface DeliveryResult {
  userId: string;
  subscriptionId: string;
  ok: boolean;
  throttled?: boolean;
  removed?: boolean;
  error?: string;
}

/**
 * Sends a notification to every device a user registered from this app.
 *
 * @param userId The IdP user id
 * @param notification What to show
 * @returns One result per device
 * @throws When `RP_ORIGIN` is not set or the IdP refuses the request
 */
export async function notifyUser(
  userId: string,
  notification: Notification,
): Promise<DeliveryResult[]> {
  const { rpOrigin, idpOrigin } = config();
  if (!rpOrigin) {
    throw new Error(
      "RP_ORIGIN is not set — it is the clientId the IdP knows this app by",
    );
  }
  const { privateKey, kid } = await getSigningKey();
  const iat = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", typ: "client-assertion+jwt", kid })
    .setIssuer(rpOrigin)
    .setSubject(rpOrigin)
    .setAudience(idpOrigin)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 60)
    .setJti(crypto.randomUUID())
    .sign(privateKey);

  const response = await fetch(`${idpOrigin}/rp/notifications`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${assertion}`,
    },
    body: JSON.stringify({ userIds: [userId], notification }),
  });
  const data = await response.json().catch(() => ({})) as {
    message?: string;
    results?: DeliveryResult[];
  };
  if (!response.ok) {
    throw new Error(
      data.message ?? `IdP refused the notification (${response.status})`,
    );
  }
  return data.results ?? [];
}
