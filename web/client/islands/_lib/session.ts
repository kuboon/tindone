/**
 * This browser's standing with id.kbn.one, shared by every island on the page — and the way every
 * island talks to this app's API.
 *
 * `@kuboon/dpop` keeps an ECDSA key in IndexedDB and signs a DPoP proof for each request made with
 * `fetchDpop`. The IdP binds its session to that key's thumbprint when the user signs in (the
 * `dpop_jkt` passed to `/authorize`), so `GET ${idp}/session` made with `fetchDpop` answers with
 * the user — and a token (`jws`) bound to the same key.
 *
 * That token is the browser's credential here. The pages are the same HTML for everyone, so
 * nothing about the user arrives with them: an island asks {@link SessionStore.api}, which sends
 * `Authorization: DPoP <jws>` with a fresh proof on every request (see `server/auth.ts`).
 *
 * The token is kept in `localStorage` until shortly before it expires, so id.kbn.one is asked again
 * only when it runs out or the server refuses it. Keeping it there is safe for the same reason
 * DPoP is: without the private key, which never leaves IndexedDB, the token is useless.
 *
 * A plain module-level instance: every island is compiled in one `Deno.bundle` graph, so this
 * module is emitted once, into a chunk they all import. {@link SessionStore.load} sets up the key
 * once however many islands ask, and survives frame navigations.
 */

import { init } from "@kuboon/dpop";
import { TypedEventTarget } from "@remix-run/ui";

export type FetchDpop = typeof fetch;

export interface IdpSession {
  userId: string | null;
  jws?: string;
}

/** What is kept between page loads: the token, and what it was checked against. */
interface StoredToken {
  jws: string;
  /** `sub` — the user. */
  userId: string;
  /** `exp`, in milliseconds. */
  expires: number;
  /** The key the token is bound to; a new key means the token is worthless. */
  thumbprint: string;
}

const STORAGE_KEY = "tindone:idp-token";
/** A token this close to expiring is fetched again rather than sent. */
const EXPIRY_MARGIN_MS = 60_000;

function readStored(thumbprint: string): StoredToken | null {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as
      | StoredToken
      | null;
    if (
      !stored || stored.thumbprint !== thumbprint ||
      stored.expires - EXPIRY_MARGIN_MS <= Date.now()
    ) return null;
    return stored;
  } catch {
    return null;
  }
}

function writeStored(token: StoredToken | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, JSON.stringify(token));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be off (private mode); the token then lives as long as the page.
  }
}

/** The claims this needs from a JWS, read without verifying — the server verifies. */
function claims(jws: string): { sub?: string; exp?: number } {
  try {
    const payload = Uint8Array.fromBase64(jws.split(".")[1] ?? "", {
      alphabet: "base64url",
    });
    return JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return {};
  }
}

class SessionStore extends TypedEventTarget<{ change: Event }> {
  idpOrigin = "";
  /** DPoP-bound fetch, once {@link load} resolves; `null` if the key could not be set up. */
  fetchDpop: FetchDpop | null = null;
  /** This browser key's thumbprint — the `dpop_jkt` of a sign-in. */
  thumbprint = "";
  session: IdpSession = { userId: null };
  ready = false;

  #loading?: Promise<void>;

  /**
   * Sets up the DPoP key and finds out who is signed in — once. A stored token answers that
   * without asking id.kbn.one.
   *
   * @param idpOrigin The IdP, as the server configured it
   * @param options.fresh Ask id.kbn.one even if a token is stored — right after a sign-in
   */
  load(idpOrigin: string, options: { fresh?: boolean } = {}): Promise<void> {
    this.idpOrigin = idpOrigin;
    return this.#loading ??= (async () => {
      try {
        const { fetchDpop, thumbprint } = await init();
        this.fetchDpop = fetchDpop;
        this.thumbprint = thumbprint;
        const stored = options.fresh ? null : readStored(thumbprint);
        if (stored) {
          this.session = { userId: stored.userId, jws: stored.jws };
        } else {
          await this.#askIdp();
        }
      } catch (error) {
        console.error("id.kbn.one session probe failed:", error);
      } finally {
        this.ready = true;
        this.dispatchEvent(new Event("change"));
      }
    })();
  }

  /** `GET ${idp}/session`, and keep what it says. */
  async #askIdp(): Promise<void> {
    if (!this.fetchDpop) return;
    const response = await this.fetchDpop(`${this.idpOrigin}/session`);
    const body = response.ok
      ? await response.json() as { userId?: string | null; jws?: string }
      : {};
    const { sub, exp } = body.jws ? claims(body.jws) : {};
    if (body.jws && sub && exp) {
      this.session = { userId: sub, jws: body.jws };
      writeStored({
        jws: body.jws,
        userId: sub,
        expires: exp * 1000,
        thumbprint: this.thumbprint,
      });
    } else {
      this.session = { userId: null };
      writeStored(null);
    }
  }

  /** Asks id.kbn.one again, past the stored token: when the server refuses the token it has. */
  async refresh(): Promise<void> {
    await this.load(this.idpOrigin);
    try {
      await this.#askIdp();
    } catch (error) {
      console.error("id.kbn.one session probe failed:", error);
    }
    this.dispatchEvent(new Event("change"));
  }

  /**
   * A request to this app's API as the signed-in user: `Authorization: DPoP <jws>` and a proof
   * for this very request. A `401` means the token went stale on the server's side (or the user
   * signed out elsewhere), so it is fetched again from id.kbn.one and the request retried once.
   *
   * Call {@link load} first; until it has resolved there is no key to sign with.
   *
   * @param path A path on this origin, such as `routes.api.all.href()`
   * @param init As for `fetch`; a body must be one that can be sent twice (a string)
   * @returns The response — `401` when nobody is signed in
   */
  async api(path: string, init: RequestInit = {}): Promise<Response> {
    const send = async () => {
      const { jws } = this.session;
      if (!this.fetchDpop || !jws) return new Response(null, { status: 401 });
      const headers = Object.fromEntries(new Headers(init.headers));
      headers.authorization = `DPoP ${jws}`;
      return await this.fetchDpop(new URL(path, location.origin).href, {
        ...init,
        headers,
      });
    };
    const response = await send();
    if (response.status !== 401 || !this.session.jws) return response;
    await response.body?.cancel();
    await this.refresh();
    return await send();
  }

  /**
   * The IdP's `/authorize` URL for this browser key.
   *
   * @param redirectUri Where to come back to — its origin must be whitelisted on the IdP
   */
  authorizeUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      dpop_jkt: this.thumbprint,
      redirect_uri: redirectUri,
    });
    return `${this.idpOrigin}/authorize?${params}`;
  }

  /** Ends the IdP session bound to this key, and forgets the token. */
  async signOut(): Promise<void> {
    if (this.fetchDpop) {
      await this.fetchDpop(`${this.idpOrigin}/session/logout`, {
        method: "POST",
      }).catch(() => {});
    }
    this.session = { userId: null };
    writeStored(null);
    this.dispatchEvent(new Event("change"));
  }
}

export const sessionStore: SessionStore = new SessionStore();
