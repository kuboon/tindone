/**
 * The database: its tables, and the one connection the server shares.
 *
 * The tables are declared here for `@remix-run/data-table`; the SQL that creates them is in
 * `db/migrations/`, applied with `deno task db migrate`. The two are kept in step by hand — there is
 * no generator in either direction.
 *
 * Turso's client is asynchronous, which the stock SQLite adapter cannot drive, so the adapter is
 * `@remix-kbn/data-table-sqlite-turso`. A remote database is reached with `@libsql/client/web`,
 * which is plain `fetch` and runs anywhere Deno does; only a local `file:` database needs the
 * native client, and that is imported on demand so a deploy never loads it.
 */

import { column as c, table } from "@remix-run/data-table";
import { createTursoDatabase } from "@remix-kbn/data-table-sqlite-turso";
import type { Client } from "@libsql/client";

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

async function connect(): Promise<Client> {
  const options = {
    url: config.databaseUrl,
    authToken: config.databaseAuthToken || undefined,
  };
  if (config.databaseUrl.startsWith("file:")) {
    const path = config.databaseUrl.slice("file:".length);
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (dir) await Deno.mkdir(dir, { recursive: true });
    const { createClient } = await import("@libsql/client");
    return createClient(options);
  }
  const { createClient } = await import("@libsql/client/web");
  return createClient(options);
}

export const db = createTursoDatabase(await connect());

/** Milliseconds since the epoch — the unit every `*_at` column is in. */
export function now(): number {
  return Date.now();
}
