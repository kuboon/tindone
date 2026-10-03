import { assertEquals } from "@std/assert";

import { browser, idpToken, RP_ORIGIN, shutdown } from "./test_setup.ts";
const { getDb, users } = await import("./db.ts");
const { createApp } = await import("./app.tsx");

const app = createApp({
  getScriptEntry: () =>
    Promise.resolve({
      href: "/assets/island.js",
      preloads: [],
      importMap: { imports: {} },
    }),
  runtime: { src: "/assets/runtime.js", preloads: [] },
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

Deno.test("GET /api/:list returns the list's tasks", async () => {
  const auth = { authorization: "Bearer carol-token" };
  for (const content of ["first", "second"]) {
    const created = await api("/api/waiting", {
      method: "POST",
      headers: auth,
      body: content,
    });
    assertEquals(created.status, 200);
    await created.body?.cancel();
  }
  const response = await api("/api/waiting", { headers: auth });
  assertEquals(response.status, 200);
  const { tasks } = await response.json();
  assertEquals(
    tasks.map((task: { content: string; list: string }) => [
      task.content,
      task.list,
    ]),
    [["first", "waiting"], ["second", "waiting"]],
  );
  assertEquals("user_id" in tasks[0], false);

  const unknown = await api("/api/someday", { headers: auth });
  assertEquals(unknown.status, 400);
  await unknown.body?.cancel();

  const anonymous = await api("/api/waiting");
  assertEquals(anonymous.status, 401);
  await anonymous.body?.cancel();
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

Deno.test("the browser calls the API with id.kbn.one's token and a DPoP proof", async () => {
  const { thumbprint, request } = await browser();
  const token = await idpToken({ sub: "dave", cnf: { jkt: thumbprint } });

  const me = await app.fetch(await request(token, "/api/me"));
  assertEquals(me.status, 200);
  const { apiToken } = await me.json();
  assertEquals(typeof apiToken, "string");

  const created = await app.fetch(
    await request(token, "/api/inbox", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "via DPoP" }),
    }),
  );
  assertEquals(created.status, 200);
  await created.body?.cancel();

  const all = await app.fetch(await request(token, "/api/tasks"));
  assertEquals(all.headers.get("cache-control"), "private, no-store");
  const { tasks } = await all.json();
  assertEquals(tasks.map((t: { content: string }) => t.content), ["via DPoP"]);
});

Deno.test("a bad DPoP credential is a 401", async () => {
  const mine = await browser();
  const theirs = await browser();
  const token = await idpToken({
    sub: "dave",
    cnf: { jkt: theirs.thumbprint },
  });
  const response = await app.fetch(await mine.request(token, "/api/me"));
  assertEquals(response.status, 401);
  assertEquals(response.headers.get("www-authenticate"), "DPoP");
  await response.body?.cancel();
});

Deno.test("a task answers to anyone; only its owner is told so", async () => {
  const created = await api("/api/inbox", {
    method: "POST",
    headers: { authorization: "Bearer carol-token" },
    body: "shared",
  });
  const { taskId } = await created.json();

  const anonymous = await api(`/api/tasks/${taskId}`);
  const body = await anonymous.json();
  assertEquals(body.task.content, "shared");
  assertEquals(body.owner, false);
  assertEquals(body.logs.length, 1);

  const owner = await api(`/api/tasks/${taskId}`, {
    headers: { authorization: "Bearer carol-token" },
  });
  assertEquals((await owner.json()).owner, true);

  const missing = await api("/api/tasks/nope");
  assertEquals(missing.status, 404);
  await missing.body?.cancel();
});

Deno.test("regenerating the API token retires the old one", async () => {
  await (await getDb()).create(users, {
    id: "erin",
    api_token: "erin-token",
    created_at: 0,
  });
  const rotated = await api("/api/me/token", {
    method: "POST",
    headers: { authorization: "Bearer erin-token" },
  });
  const { apiToken } = await rotated.json();
  assertEquals(apiToken === "erin-token", false);

  const old = await api("/api/me", {
    headers: { authorization: "Bearer erin-token" },
  });
  assertEquals(old.status, 401);
  await old.body?.cancel();
  const fresh = await api("/api/me", {
    headers: { authorization: `Bearer ${apiToken}` },
  });
  assertEquals(fresh.status, 200);
  await fresh.body?.cancel();
});

Deno.test("pages are the same for everyone, and cacheable", async () => {
  for (const path of ["/", "/done", "/swipe/inbox", "/tasks/anything"]) {
    const response = await api(path, {
      headers: { authorization: "Bearer carol-token", cookie: "x=1" },
    });
    assertEquals(response.status, 200, path);
    assertEquals(response.headers.get("set-cookie"), null, path);
    assertEquals(
      response.headers.get("cache-control"),
      "public, max-age=0, must-revalidate",
      path,
    );
    const html = await response.text();
    assertEquals(html.includes("carol-token"), false, path);
  }
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
