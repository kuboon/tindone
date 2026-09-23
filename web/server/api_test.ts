import { assertEquals } from "@std/assert";

import { RP_ORIGIN, shutdown } from "./test_setup.ts";
const { getDb, users } = await import("./db.ts");
const { createApp } = await import("./app.tsx");

const app = createApp({
  getScriptEntry: () =>
    Promise.resolve({ href: "", preloads: [], importMap: { imports: {} } }),
  runtime: { src: "", preloads: [] },
});
await (await getDb()).create(users, {
  id: "carol",
  api_token: "carol-token",
  created_at: 0,
});

function api(path: string, init: RequestInit = {}) {
  return app.fetch(new Request(`${RP_ORIGIN}${path}`, init));
}

Deno.test("the API takes its token from the Authorization header", async () => {
  const created = await api("/api/inbox", {
    method: "POST",
    headers: { authorization: "Bearer carol-token" },
    body: "buy milk",
  });
  assertEquals(created.status, 200);
  const { taskId } = await created.json();

  const moved = await api(`/api/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      authorization: "Bearer carol-token",
      "content-type": "application/json",
    },
    body: JSON.stringify({ list: "done", push: false }),
  });
  assertEquals(moved.status, 200);
  await moved.body?.cancel();
});

Deno.test("a missing or unknown token is a 401", async () => {
  const attempts: HeadersInit[] = [
    {},
    { authorization: "Bearer nope" },
    { authorization: "carol-token" },
  ];
  for (const headers of attempts) {
    const response = await api("/api/inbox", {
      method: "POST",
      headers,
      body: "x",
    });
    assertEquals(response.status, 401);
    assertEquals(response.headers.get("www-authenticate"), "Bearer");
    await response.body?.cancel();
  }
});

Deno.test("the token is no longer accepted in the URL", async () => {
  const response = await api("/api/u/carol-token/inbox", {
    method: "POST",
    body: "x",
  });
  assertEquals(response.status === 200, false);
  await response.body?.cancel();
});

Deno.test("the CORS preflight allows the Authorization header", async () => {
  const response = await api("/api/inbox", { method: "OPTIONS" });
  assertEquals(response.status, 204);
  assertEquals(
    response.headers.get("access-control-allow-headers")?.includes(
      "authorization",
    ),
    true,
  );
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
