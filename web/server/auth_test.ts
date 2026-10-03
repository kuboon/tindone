import { assertEquals, assertRejects } from "@std/assert";

import { browser, idpToken, RP_ORIGIN, shutdown } from "./test_setup.ts";
const { AuthError, dpopUser, userByToken } = await import("./auth.ts");

Deno.test("a token bound to the caller's key is the user", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-1", cnf: { jkt: thumbprint } });
  const user = await dpopUser(await request(token));
  assertEquals(user.id, "user-1");
  assertEquals((await userByToken(user.apiToken))?.id, "user-1");
});

Deno.test("one token serves request after request, each with its own proof", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-5", cnf: { jkt: thumbprint } });
  const first = await dpopUser(await request(token));
  const second = await dpopUser(await request(token, "/api/tasks"));
  assertEquals(first, second);
});

Deno.test("a token bound to another key is refused", async () => {
  const mine = await browser();
  const theirs = await browser();
  const token = await idpToken({
    sub: "user-2",
    cnf: { jkt: theirs.thumbprint },
  });
  await assertRejects(
    async () => dpopUser(await mine.request(token)),
    AuthError,
  );
});

Deno.test("a token from another issuer is refused", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken(
    { sub: "user-3", cnf: { jkt: thumbprint } },
    "https://evil.example",
  );
  await assertRejects(async () => dpopUser(await request(token)), AuthError);
});

Deno.test("a replayed request is refused", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-4", cnf: { jkt: thumbprint } });
  const first = await request(token);
  await dpopUser(first.clone());
  await assertRejects(() => dpopUser(first), AuthError);
});

Deno.test("a proof for another URL is refused", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "user-6", cnf: { jkt: thumbprint } });
  const proofFor = await request(token, "/api/me");
  const elsewhere = new Request(`${RP_ORIGIN}/api/tasks`, {
    headers: proofFor.headers,
  });
  await assertRejects(() => dpopUser(elsewhere), AuthError);
});

Deno.test("a request without a token is refused", async () => {
  await assertRejects(
    () => dpopUser(new Request(`${RP_ORIGIN}/api/me`)),
    AuthError,
  );
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
