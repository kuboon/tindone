/**
 * One-time setup of the Worker's secrets: `deno task init-secrets`, run by the next deploy
 * (`.github/workflows/deploy.yml`) and then removed again.
 *
 * - `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are copied from the repository's Actions secrets.
 * - `SESSION_SECRET` and `RP_SIGNING_KEY_JWK` are generated — but only when the Worker does not have
 *   them yet, so running this twice by accident does not sign everyone out or change the key
 *   id.kbn.one verifies against.
 *
 * Values go to Wrangler on stdin and are never printed.
 */

const WRANGLER = ["--yes", "wrangler@4"];

async function wrangler(args: string[], stdin?: string): Promise<string> {
  const child = new Deno.Command("npx", {
    args: [...WRANGLER, ...args],
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "inherit",
  }).spawn();
  if (stdin !== undefined) {
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    await writer.close();
  }
  const { code, stdout } = await child.output();
  if (code !== 0) {
    throw new Error(`wrangler ${args[0]} ${args[1]} exited with ${code}`);
  }
  return new TextDecoder().decode(stdout);
}

/** 32 random bytes, base64url: the cookie-signing secret. */
function newSessionSecret(): string {
  return crypto.getRandomValues(new Uint8Array(32)).toBase64({
    alphabet: "base64url",
    omitPadding: true,
  });
}

/** A fresh ES256 private key as JWK JSON: what `server/push.ts` signs client assertions with. */
async function newSigningKey(): Promise<string> {
  const { privateKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const { kty, crv, x, y, d } = await crypto.subtle.exportKey(
    "jwk",
    privateKey,
  );
  return JSON.stringify({ kty, crv, x, y, d });
}

const GENERATED: Record<string, () => string | Promise<string>> = {
  SESSION_SECRET: newSessionSecret,
  RP_SIGNING_KEY_JWK: newSigningKey,
};

const COPIED = ["TURSO_DATABASE_URL", "TURSO_AUTH_TOKEN"];

const secrets: Record<string, string> = {};

for (const name of COPIED) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  secrets[name] = value;
}

// `secret list` prints JSON after Wrangler's own banner lines.
const listing = await wrangler(["secret", "list", "--format", "json"]);
const existing = new Set(
  (JSON.parse(listing.slice(listing.indexOf("["))) as { name: string }[])
    .map((secret) => secret.name),
);

for (const [name, generate] of Object.entries(GENERATED)) {
  if (existing.has(name)) {
    console.log(`${name}: kept`);
  } else {
    secrets[name] = await generate();
    console.log(`${name}: generated`);
  }
}

await wrangler(["secret", "bulk"], JSON.stringify(secrets));
console.log(`set ${Object.keys(secrets).join(", ")}`);
