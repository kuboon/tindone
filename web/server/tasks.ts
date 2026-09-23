/**
 * Tasks and their history: every read and write the app makes, with the rules they follow.
 *
 * Both ways in end up here — the pages a signed-in user clicks through, and the curl-able API
 * addressed by token — so a rule stated here (a content length, which lists a task may be created
 * in, that every move is logged) holds for both.
 */

import { and, eq } from "@remix-run/data-table";

import { getDb, type ListName, now, taskLogs, tasks } from "./db.ts";
import { newId } from "./ids.ts";
import { notifyUser } from "./push.ts";

export const MAX_CONTENT_LENGTH = 100;

/** Lists a task can be created in. `done` is somewhere a task arrives, not where it starts. */
export const OPEN_LISTS = ["inbox", "now", "next", "waiting"] as const;
export type OpenList = (typeof OPEN_LISTS)[number];

export function isOpenList(value: unknown): value is OpenList {
  return typeof value === "string" &&
    (OPEN_LISTS as readonly string[]).includes(value);
}

export interface Task {
  id: string;
  user_id: string;
  content: string;
  list: ListName;
  created_at: number;
  updated_at: number;
}

export interface TaskLog {
  id: string;
  task_id: string;
  from_list: ListName | null;
  to_list: ListName;
  created_at: number;
}

/** A request the rules refuse, with a message fit for an API client. */
export class TaskError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Trims and checks a task's text.
 *
 * @param raw What was submitted
 * @returns The content to store
 * @throws {TaskError} When it is empty or too long
 */
export function validContent(raw: unknown): string {
  const content = typeof raw === "string" ? raw.trim() : "";
  if (content.length === 0 || content.length > MAX_CONTENT_LENGTH) {
    throw new TaskError(`Content must be 1-${MAX_CONTENT_LENGTH} chars`);
  }
  return content;
}

export async function listCounts(
  userId: string,
): Promise<Record<ListName, number>> {
  const counts: Record<ListName, number> = {
    inbox: 0,
    now: 0,
    next: 0,
    waiting: 0,
    done: 0,
  };
  for (const task of await allTasks(userId)) counts[task.list]++;
  return counts;
}

/** Every task a user has, oldest first — what the export copies. */
export async function allTasks(userId: string): Promise<Task[]> {
  return await (await getDb()).findMany(tasks, {
    where: { user_id: userId },
    orderBy: ["created_at", "asc"],
  }) as Task[];
}

/**
 * The cards of one list, in the order they are swiped: least recently moved first, so a card
 * swiped back into its own list goes to the end of the stack.
 */
export async function tasksInList(
  userId: string,
  list: ListName,
): Promise<Task[]> {
  return await (await getDb()).findMany(tasks, {
    where: { user_id: userId, list },
    orderBy: [["updated_at", "asc"], ["created_at", "asc"]],
  }) as Task[];
}

/** Finished tasks, most recently finished first. */
export async function doneTasks(userId: string): Promise<Task[]> {
  return await (await getDb()).findMany(tasks, {
    where: { user_id: userId, list: "done" },
    orderBy: ["updated_at", "desc"],
  }) as Task[];
}

/** A task by id, whoever owns it — task pages are shareable by URL. */
export async function findTask(taskId: string): Promise<Task | null> {
  return await (await getDb()).find(tasks, taskId) as Task | null;
}

/** A task's moves, newest first. */
export async function taskHistory(taskId: string): Promise<TaskLog[]> {
  return await (await getDb()).findMany(taskLogs, {
    where: { task_id: taskId },
    orderBy: ["created_at", "desc"],
  }) as TaskLog[];
}

async function ownTask(userId: string, taskId: string): Promise<Task> {
  const task = await (await getDb()).findOne(tasks, {
    where: and(eq(tasks.id, taskId), eq(tasks.user_id, userId)),
  }) as Task | null;
  if (!task) throw new TaskError("Task not found", 404);
  return task;
}

/**
 * Adds a task, and the log line that says where it started.
 *
 * @returns The new task's id
 */
export async function createTask(
  userId: string,
  list: OpenList,
  rawContent: unknown,
): Promise<string> {
  const content = validContent(rawContent);
  const id = newId();
  const t = now();
  await (await getDb()).transaction(async (tx) => {
    await tx.create(tasks, {
      id,
      user_id: userId,
      content,
      list,
      created_at: t,
      updated_at: t,
    });
    await tx.create(taskLogs, {
      id: newId(),
      task_id: id,
      from_list: null,
      to_list: list,
      created_at: t,
    });
  });
  return id;
}

export interface TaskUpdate {
  list?: ListName;
  content?: string;
  /**
   * Whether a move notifies the user's devices. On by default, because the point of a move made
   * from a script is that someone hears about it; the app's own screens turn it off, since the
   * person who swiped already knows.
   */
  push?: boolean;
}

/**
 * Moves a task, edits its text, or both.
 *
 * @param userId The owner — a task of anyone else's is not found
 * @param taskId The task
 * @param update What to change
 * @param taskUrl The task page's absolute URL, for the notification to open
 */
export async function updateTask(
  userId: string,
  taskId: string,
  update: TaskUpdate,
  taskUrl: string,
): Promise<void> {
  if (update.list === undefined && update.content === undefined) {
    throw new TaskError("Either list or content is required");
  }
  const content = update.content === undefined
    ? undefined
    : validContent(update.content);
  const task = await ownTask(userId, taskId);
  const t = now();

  await (await getDb()).transaction(async (tx) => {
    await tx.update(tasks, taskId, {
      ...(update.list !== undefined ? { list: update.list } : {}),
      ...(content !== undefined ? { content } : {}),
      updated_at: t,
    });
    if (update.list !== undefined) {
      await tx.create(taskLogs, {
        id: newId(),
        task_id: taskId,
        from_list: task.list,
        to_list: update.list,
        created_at: t,
      });
    }
  });

  if (update.list !== undefined && update.push !== false) {
    try {
      await notifyUser(userId, {
        title: "tindone",
        body: `${content ?? task.content} moved to ${update.list}`,
        url: taskUrl,
        tag: `task-${taskId}`,
      });
    } catch (error) {
      console.error("push failed:", error);
    }
  }
}

/** Deletes one line of a task's history. */
export async function deleteLog(
  userId: string,
  taskId: string,
  logId: string,
): Promise<void> {
  await ownTask(userId, taskId);
  await (await getDb()).deleteMany(taskLogs, {
    where: and(eq(taskLogs.id, logId), eq(taskLogs.task_id, taskId)),
  });
}
