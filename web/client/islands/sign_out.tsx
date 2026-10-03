import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

/**
 * Signs out: ends the id.kbn.one session bound to this browser's key and forgets the stored token.
 * There is nothing to end on this app's side — it keeps no session.
 */
export const SignOut = clientEntry(
  "file://client/islands/sign_out.tsx#SignOut",
  function SignOut(handle: Handle<{ idpOrigin: string }>) {
    let busy = false;

    const signOut = async () => {
      busy = true;
      handle.update();
      await sessionStore.load(handle.props.idpOrigin);
      await sessionStore.signOut();
      location.replace(routes.home.href());
    };

    return () => (
      <button
        type="button"
        disabled={busy}
        mix={[linkStyle, on("click", () => void signOut())]}
      >
        Sign out
      </button>
    );
  },
);

const linkStyle = css({ color: color.muted, fontSize: "0.9rem" });
