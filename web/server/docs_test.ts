import { assertEquals, assertStringIncludes } from "@std/assert";

import { RP_ORIGIN, shutdown } from "./test_setup.ts";
const { createApp } = await import("./app.tsx");
const { loadDocs } = await import("./docs.ts");

const docs = await loadDocs();
const app = createApp({
  getScriptEntry: () =>
    Promise.resolve({ href: "", preloads: [], importMap: { imports: {} } }),
  runtime: { src: "", preloads: [] },
}, { docs });

Deno.test("docs/api.md is served at /docs/api", async () => {
  assertEquals(docs.api.title, "tindone API");
  const response = await app.fetch(new Request(`${RP_ORIGIN}/docs/api`));
  assertEquals(response.status, 200);
  const html = await response.text();
  assertStringIncludes(html, "<title>tindone API — tindone</title>");
  assertStringIncludes(html, 'id="update-a-task"');
  assertStringIncludes(html, "<table>");
});

Deno.test("an unknown doc is a 404", async () => {
  for (const slug of ["nope", "toString"]) {
    const response = await app.fetch(new Request(`${RP_ORIGIN}/docs/${slug}`));
    assertEquals(response.status, 404);
    await response.body?.cancel();
  }
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
