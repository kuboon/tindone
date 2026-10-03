import { clientEntry, css, type Handle } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

/**
 * `/auth/callback`: the end of the id.kbn.one round trip.
 *
 * The IdP has bound its session to this browser's key by now, so `/session` answers with the user
 * and a token bound to the key — fetched fresh here, past any token stored from before. One call
 * to this app's API with it creates the user's row on a first sign-in and proves the token is
 * accepted. Then home.
 */
export const SignInCallback = clientEntry(
  "file://client/islands/sign_in_callback.tsx#SignInCallback",
  function SignInCallback(handle: Handle<{ idpOrigin: string }>) {
    let error: string | null = null;

    const finish = async () => {
      await sessionStore.load(handle.props.idpOrigin, { fresh: true });
      if (!sessionStore.session.jws) {
        error = "id.kbn.one did not sign you in.";
        return;
      }
      const response = await sessionStore.api(routes.api.me.href());
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
