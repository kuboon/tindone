/**
 * This browser's standing with id.kbn.one, shared by every island on the page.
 *
 * `@kuboon/dpop` keeps an ECDSA key in IndexedDB and signs a DPoP proof for each request made with
 * `fetchDpop`. The IdP binds its session to that key's thumbprint when the user signs in (the
 * `dpop_jkt` passed to `/authorize`), so `GET ${idp}/session` made with `fetchDpop` answers with
 * the user — and a token (`jws`) bound to the same key, which is what `/auth/session` on this
 * server exchanges for its cookie.
 *
 * A plain module-level instance: every island is compiled in one `Deno.bundle` graph, so this
 * module is emitted once, into a chunk they all import. `load()` runs the key setup and the
 * `/session` probe once however many islands ask.
 */

import { init } from "@kuboon/dpop";
import { TypedEventTarget } from "@remix-run/ui";

export type FetchDpop = typeof fetch;

export interface IdpSession {
  userId: string | null;
  jws?: string;
  nickname?: string;
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
   * Sets up the DPoP key and asks the IdP who is signed in — once.
   *
   * @param idpOrigin The IdP, as the server configured it
   */
  load(idpOrigin: string): Promise<void> {
    this.idpOrigin = idpOrigin;
    return this.#loading ??= (async () => {
      try {
        const { fetchDpop, thumbprint } = await init();
        this.fetchDpop = fetchDpop;
        this.thumbprint = thumbprint;
        const response = await fetchDpop(`${idpOrigin}/session`);
        if (response.ok) this.session = await response.json() as IdpSession;
      } catch (error) {
        console.error("id.kbn.one session probe failed:", error);
      } finally {
        this.ready = true;
        this.dispatchEvent(new Event("change"));
      }
    })();
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

  /** Ends the IdP session bound to this key. */
  async signOut(): Promise<void> {
    if (this.fetchDpop) {
      await this.fetchDpop(`${this.idpOrigin}/session/logout`, {
        method: "POST",
      }).catch(() => {});
    }
    this.session = { userId: null };
    this.dispatchEvent(new Event("change"));
  }
}

export const sessionStore: SessionStore = new SessionStore();
