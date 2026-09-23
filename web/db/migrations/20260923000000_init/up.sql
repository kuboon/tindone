-- tindone schema, rebuilt for the id.kbn.one sign-in.
--
-- The Next.js era identified a user by a random id kept in localStorage. Users are now the IdP's
-- (`users.id` is id.kbn.one's `sub`), and the curl-able API is addressed by `api_token` instead —
-- a secret that can be rotated without touching the account. Push subscriptions no longer live
-- here at all: id.kbn.one keeps them.
--
-- The old tables are dropped rather than migrated: the rewrite starts from an empty database.

DROP TABLE IF EXISTS task_logs;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  api_token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  list TEXT NOT NULL, -- 'inbox' | 'now' | 'next' | 'waiting' | 'done'
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX tasks_user_list_idx ON tasks (user_id, list, updated_at);

CREATE TABLE task_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_list TEXT,
  to_list TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX task_logs_task_idx ON task_logs (task_id, created_at);
