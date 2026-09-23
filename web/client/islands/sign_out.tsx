import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

/**
 * Signs out of both halves: this app's cookie (`/auth/logout`) and the id.kbn.one session bound
 * to this browser's key — otherwise the next "Sign in" would come straight back signed in.
 */
export const SignOut = clientEntry(
  import.meta.url,
  function SignOut(handle: Handle<{ idpOrigin: string }>) {
    let busy = false;

    const signOut = async () => {
      busy = true;
      handle.update();
      await sessionStore.load(handle.props.idpOrigin);
      await sessionStore.signOut();
      await fetch(routes.auth.logout.href(), { method: "POST" });
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
