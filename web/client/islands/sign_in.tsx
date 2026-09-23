import { clientEntry, css, type Handle, on } from "@remix-run/ui";

import { routes } from "../routes.ts";
import { color, radius } from "../tokens.ts";
import { sessionStore } from "./_lib/session.ts";

/**
 * The landing page's "Sign in" button.
 *
 * Sends the browser to id.kbn.one's `/authorize` with this browser's DPoP key thumbprint; the IdP
 * signs the user in with a passkey, binds its session to that key, and comes back to
 * `/auth/callback`, where {@link SignInCallback} finishes the job.
 *
 * Disabled until the key exists, because the thumbprint is part of the URL.
 */
export const SignIn = clientEntry(
  "file://client/islands/sign_in.tsx#SignIn",
  function SignIn(handle: Handle<{ idpOrigin: string }>) {
    if (typeof document !== "undefined") {
      sessionStore.addEventListener("change", () => handle.update(), {
        signal: handle.signal,
      });
      void sessionStore.load(handle.props.idpOrigin);
    }

    const signIn = () => {
      const callback = new URL(routes.auth.callback.href(), location.origin);
      location.href = sessionStore.authorizeUrl(callback.href);
    };

    return () => (
      <button
        type="button"
        disabled={!sessionStore.ready || !sessionStore.thumbprint}
        mix={[buttonStyle, on("click", signIn)]}
      >
        Sign in with id.kbn.one
      </button>
    );
  },
);

const buttonStyle = css({
  backgroundColor: color.primary,
  color: "white",
  padding: "18px 50px",
  borderRadius: radius.pill,
  fontSize: "1.2rem",
  fontWeight: "bold",
  boxShadow: "0 4px 15px rgba(255, 68, 88, 0.4)",
  "&:disabled": { opacity: 0.6 },
});
