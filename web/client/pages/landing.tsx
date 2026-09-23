import { css, type Handle } from "@remix-run/ui";

import { APP_NAME, TAGLINE } from "../layout.tsx";
import { SignIn } from "../islands/sign_in.tsx";
import { color } from "../tokens.ts";

/** `/` for someone who is not signed in. */
export function Landing(handle: Handle<{ idpOrigin: string }>) {
  return () => (
    <main mix={mainStyle}>
      <h1 mix={logoStyle}>{APP_NAME}</h1>
      <p mix={taglineStyle}>{TAGLINE}</p>
      <SignIn idpOrigin={handle.props.idpOrigin} />
      <p mix={noteStyle}>
        Sign-in is a passkey at <a href={handle.props.idpOrigin}>id.kbn.one</a>.
      </p>
    </main>
  );
}

// --- styles -----------------------------------------------------------------

const mainStyle = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  padding: "20px",
  textAlign: "center",
});

const logoStyle = css({
  fontSize: "4rem",
  marginBottom: "0.5rem",
  color: color.primary,
  fontWeight: 900,
  letterSpacing: "-2px",
});

const taglineStyle = css({
  marginBottom: "2.5rem",
  color: color.muted,
  fontSize: "1.2rem",
});

const noteStyle = css({
  marginTop: "1.5rem",
  color: color.muted,
  fontSize: "0.85rem",
  "& a": { textDecoration: "underline" },
});
