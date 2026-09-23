import { css, type Handle } from "@remix-run/ui";

import { SignInCallback } from "../islands/sign_in_callback.tsx";

/** `/auth/callback` — where id.kbn.one sends the browser back to. */
export function Callback(handle: Handle<{ idpOrigin: string }>) {
  return () => (
    <main mix={mainStyle}>
      <SignInCallback idpOrigin={handle.props.idpOrigin} />
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const mainStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "20px",
});
