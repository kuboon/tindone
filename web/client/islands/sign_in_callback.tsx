import { clientEntry, css, type Handle } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

/**
 * `/auth/callback`: the end of the id.kbn.one round trip.
 *
 * The IdP has bound its session to this browser's key by now, so `/session` answers with the user
 * and a token bound to the key. That token goes to this server's `/auth/session` with a DPoP proof
 * made by the same key; the server checks both and answers with the session cookie. Then home.
 */
export const SignInCallback = clientEntry(
  import.meta.url,
  function SignInCallback(handle: Handle<{ idpOrigin: string }>) {
    let error: string | null = null;

    const finish = async () => {
      await sessionStore.load(handle.props.idpOrigin);
      const { jws } = sessionStore.session;
      if (!sessionStore.fetchDpop || !jws) {
        error = "id.kbn.one did not sign you in.";
        return;
      }
      const response = await sessionStore.fetchDpop(
        new URL(routes.auth.session.href(), location.origin).href,
        { method: "POST", headers: { authorization: `DPoP ${jws}` } },
      );
      if (!response.ok) {
        error = `Sign-in was refused: ${await response.text()}`;
        return;
      }
      location.replace(routes.home.href());
    };

    if (typeof document !== "undefined") {
      finish().catch((e) => {
        error = e instanceof Error ? e.message : String(e);
      }).finally(() => handle.update());
    }

    return () => (
      <div mix={boxStyle}>
        {error
          ? (
            <>
              <p mix={errorStyle}>{error}</p>
              <a mix={linkStyle} href={routes.home.href()}>← Back to start</a>
            </>
          )
          : <p>Signing you in…</p>}
      </div>
    );
  },
);

const boxStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "20px",
});

const errorStyle = css({ color: color.primary });

const linkStyle = css({ color: color.primary, fontWeight: "bold" });
