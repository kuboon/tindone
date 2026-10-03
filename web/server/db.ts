/**
 * The database: its tables, and the one connection the server shares.
 *
 * The tables are declared here for `@remix-run/data-table`; the SQL that creates them is in
 * `db/migrations/`, applied with `deno task db migrate`. The two are kept in step by hand — there is
 * no generator in either direction.
 *
 * The database is Cloudflare D1, driven by `@remix-kbn/data-table-d1`. On Workers it is the `DB`
 * binding, handed over by `worker.ts`. Under `deno serve` and in tests there is no binding, so a
 * local SQLite file stands in through `createLocalD1()`, which behaves the way D1 does — including
 * D1's transactions, which queue their writes and commit them as one batch: inside
 * `transaction()`, write without `returning` (`updateMany()`, not `update()`) and read before the
 * first write.
 */

import { column as c, table } from "@remix-run/data-table";
import {
  createD1Database,
  type D1BackedDatabase,
  type D1DatabaseBinding,
} from "@remix-kbn/data-table-d1";

import { config } from "./config.ts";

export const LISTS = ["inbox", "now", "next", "waiting", "done"] as const;
export type ListName = (typeof LISTS)[number];

export function isListName(value: unknown): value is ListName {
  return typeof value === "string" &&
    (LISTS as readonly string[]).includes(value);
}

export const users = table({
  name: "users",
  columns: {
    id: c.text(),
    api_token: c.text(),
    created_at: c.integer(),
  },
});

export const tasks = table({
  name: "tasks",
  columns: {
    id: c.text(),
    user_id: c.text(),
    content: c.text(),
    list: c.text(),
    created_at: c.integer(),
    updated_at: c.integer(),
  },
});

export const taskLogs = table({
  name: "task_logs",
  columns: {
    id: c.text(),
    task_id: c.text(),
    from_list: c.text().nullable(),
    to_list: c.text(),
    created_at: c.integer(),
  },
});

let binding: D1DatabaseBinding | undefined;
let database: Promise<D1BackedDatabase> | undefined;

/**
 * Hands the server the Worker's D1 binding. Without one, the database is a local file.
 *
 * @param d1 `env.DB`
 */
export function setDatabaseBinding(d1: D1DatabaseBinding): void {
  binding = d1;
  database = undefined;
}

async function connect(): Promise<D1DatabaseBinding> {
  if (binding) return binding;
  // Named through a variable so the Worker bundle never pulls in `node:sqlite`: a Worker always
  // has its binding, and could not open a file anyway.
  const local = "@remix-kbn/data-table-d1/node";
  const { createLocalD1 } = await import(
    local
  ) as typeof import("@remix-kbn/data-table-d1/node");
  return await createLocalD1(config().databaseFile);
}

/** The database, connected on first use. */
export function getDb(): Promise<D1BackedDatabase> {
  return database ??= connect().then((d1) => createD1Database(d1));
}

/** Milliseconds since the epoch — the unit every `*_at` column is in. */
export function now(): number {
  return Date.now();
}
