import { assertEquals, assertMatch, assertRejects } from "@std/assert";
import { init, InMemoryKeyRepository } from "@kuboon/dpop";

import { idpToken, RP_ORIGIN, shutdown } from "./test_setup.ts";
const { currentUser, signIn, SignInError, userByToken } = await import(
  "./auth.ts"
);

/** A browser: its own DPoP key, and the request `/auth/callback` would send. */
async function browser() {
  let captured: Request | undefined;
  const { fetchDpop, thumbprint } = await init({
    keyStore: new InMemoryKeyRepository(),
    fetch: (input, requestInit) => {
      captured = new Request(input, requestInit);
      return Promise.resolve(new Response(null));
    },
  });
  const request = async (token: string) => {
    await fetchDpop(`${RP_ORIGIN}/auth/session`, {
      method: "POST",
      headers: { authorization: `DPoP ${token}` },
    });
    return captured!;
  };
  return { thumbprint, request };
}

Deno.test("a token bound to the caller's key signs the user in", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-1", cnf: { jkt: thumbprint } });
  const cookie = await signIn(await request(token));
  assertMatch(cookie, /^tindone_session=/);

  const user = await currentUser(
    new Request(RP_ORIGIN, { headers: { cookie: cookie.split(";")[0] } }),
  );
  assertEquals(user?.id, "user-1");
  assertEquals((await userByToken(user!.apiToken))?.id, "user-1");
});

Deno.test("a token bound to another key is refused", async () => {
  const mine = await browser();
  const theirs = await browser();
  const token = await idpToken({
    sub: "user-2",
    cnf: { jkt: theirs.thumbprint },
  });
  await assertRejects(
    async () => signIn(await mine.request(token)),
    SignInError,
  );
});

Deno.test("a token from another issuer is refused", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken(
    { sub: "user-3", cnf: { jkt: thumbprint } },
    "https://evil.example",
  );
  await assertRejects(async () => signIn(await request(token)), SignInError);
});

Deno.test("a replayed sign-in request is refused", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-4", cnf: { jkt: thumbprint } });
  const first = await request(token);
  await signIn(first.clone());
  await assertRejects(() => signIn(first), SignInError);
});

Deno.test("a request without a token is refused", async () => {
  await assertRejects(
    () => signIn(new Request(`${RP_ORIGIN}/auth/session`, { method: "POST" })),
    SignInError,
  );
});

Deno.test("a forged cookie is nobody", async () => {
  const user = await currentUser(
    new Request(RP_ORIGIN, { headers: { cookie: "tindone_session=user-1" } }),
  );
  assertEquals(user, null);
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
