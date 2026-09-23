import { assertEquals, assertRejects } from "@std/assert";

import { shutdown } from "./test_setup.ts";
const { getDb, users } = await import("./db.ts");
const db = await getDb();
const tasks = await import("./tasks.ts");

await db.create(users, { id: "alice", api_token: "a", created_at: 0 });
await db.create(users, { id: "bob", api_token: "b", created_at: 0 });

Deno.test("a new task starts with a log line", async () => {
  const id = await tasks.createTask("alice", "inbox", "  buy milk  ");
  const task = await tasks.findTask(id);
  assertEquals(task?.content, "buy milk");
  assertEquals(task?.list, "inbox");
  const history = await tasks.taskHistory(id);
  assertEquals(history.map((l) => [l.from_list, l.to_list]), [[null, "inbox"]]);
});

Deno.test("content must be 1-100 characters", async () => {
  await assertRejects(
    () => tasks.createTask("alice", "inbox", "   "),
    tasks.TaskError,
  );
  await assertRejects(
    () => tasks.createTask("alice", "inbox", "x".repeat(101)),
    tasks.TaskError,
  );
});

Deno.test("moving a task logs it, and a swipe back re-queues it", async () => {
  const first = await tasks.createTask("alice", "now", "first");
  const second = await tasks.createTask("alice", "now", "second");
  await tasks.updateTask("alice", first, { list: "now", push: false }, "");
  const order = (await tasks.tasksInList("alice", "now")).map((t) => t.id);
  assertEquals(order.indexOf(second) < order.indexOf(first), true);
  assertEquals((await tasks.taskHistory(first))[0].from_list, "now");
});

Deno.test("another user's task is not found", async () => {
  const id = await tasks.createTask("alice", "inbox", "private");
  const error = await assertRejects(
    () => tasks.updateTask("bob", id, { list: "done", push: false }, ""),
    tasks.TaskError,
  );
  assertEquals(error.status, 404);
  await assertRejects(
    () => tasks.deleteLog("bob", id, "whatever"),
    tasks.TaskError,
  );
});

Deno.test("a log line can be deleted", async () => {
  const id = await tasks.createTask("alice", "inbox", "logged");
  await tasks.updateTask("alice", id, { list: "next", push: false }, "");
  const [latest] = await tasks.taskHistory(id);
  await tasks.deleteLog("alice", id, latest.id);
  assertEquals((await tasks.taskHistory(id)).length, 1);
});

Deno.test("counts cover every list", async () => {
  const counts = await tasks.listCounts("bob");
  assertEquals(counts, { inbox: 0, now: 0, next: 0, waiting: 0, done: 0 });
});

Deno.test({ name: "teardown", fn: shutdown, sanitizeResources: false });
