/**
 * The app, wired by hand — the same on both hosts.
 *
 * `client/routes.ts` names every URL; this file maps each one to what answers it, with a controller
 * per route map. A controller has to name an action for every route in its map — leave one out and
 * the router throws while it is being built, rather than serving an app with a hole in it.
 *
 * Pages are ordinary Remix components in `client/pages/`, rendered into `client/layout.tsx` by
 * `context.render` from the `render({ assets })` middleware. Where a page needs something only the
 * server knows — the user's tasks, their API token, the IdP's origin — it is handed in as props.
 *
 * Two kinds of caller, two ways of knowing who they are:
 *
 * - **Pages and their forms** read the session cookie (`auth.ts`). A form posts, the action does
 *   the work, and the answer is a `303` back to a page.
 * - **`/api/…`** is for scripts, authorized by the user's API token as `Authorization: Bearer
 *   <token>`. The swipe deck uses the same endpoints, so a swipe and a `curl` are one code path.
 *
 * What differs between hosts is only how the client bundle is found ({@link Scripts}): `router.tsx`
 * compiles it on startup for `deno serve`, and `worker.ts` reads the manifest `build.ts` wrote.
 * Static files (`/static/*`, `/sw.js`, `/manifest.webmanifest`, `/assets/*`) are routes here for
 * development; on Workers they are Static Assets, answered before the Worker runs.
 */

import {
  createController,
  createRouter,
  type RouterContext,
} from "@remix-run/fetch-router";
import { render } from "@remix-run/render-middleware";
import type { RemixNode } from "@remix-run/ui";

import {
  currentUser,
  rotateApiToken,
  signIn,
  SignInError,
  signOut,
  type User,
  userByToken,
} from "./auth.ts";
import { config, publicOrigin } from "./config.ts";
import type { Scripts } from "./scripts.ts";
import { isListName } from "./db.ts";
import { jwks } from "./push.ts";
import { notFound, serveStatic } from "./static.ts";
import {
  allTasks,
  createTask,
  deleteLog,
  doneTasks,
  findTask,
  isOpenList,
  listCounts,
  TaskError,
  taskHistory,
  tasksInList,
  type TaskUpdate,
  updateTask,
} from "./tasks.ts";
import { APP_NAME, Layout, TAGLINE } from "../client/layout.tsx";
import { SWIPE_LISTS } from "../client/lists.ts";
import { routes } from "../client/routes.ts";
import { Callback } from "../client/pages/callback.tsx";
import { Done } from "../client/pages/done.tsx";
import { Home } from "../client/pages/home.tsx";
import { Landing } from "../client/pages/landing.tsx";
import { Swipe } from "../client/pages/swipe.tsx";
import { TaskPage } from "../client/pages/task.tsx";

function makeRouter(scripts: Scripts) {
  return createRouter({ middleware: [render({ assets: scripts })] });
}

export type AppContext = RouterContext<ReturnType<typeof makeRouter>>;

declare module "@remix-run/fetch-router" {
  interface RouterTypes {
    context: AppContext;
  }
}

// --- helpers ------------------------------------------------------------------

/** Set by {@link createApp}: the runtime a hydrating page loads. */
let clientRuntime: Scripts["runtime"];

interface PageOptions {
  title: string;
  description?: string;
  /** Whether the page places an island, so the shell loads the client runtime. */
  hydrate: boolean;
}

/** Renders a page into the shell. Pages are per-user, so no shared cache may keep one. */
function page(
  context: AppContext,
  options: PageOptions,
  body: RemixNode,
): Response {
  const response = context.render(
    <Layout
      title={options.title}
      description={options.description}
      script={options.hydrate ? clientRuntime : null}
    >
      {body}
    </Layout>,
  );
  response.headers.set("cache-control", "private, no-store");
  return response;
}

function redirect(location: string, headers?: HeadersInit): Response {
  const response = new Response(null, { status: 303, headers });
  response.headers.set("location", location);
  return response;
}

/** The signed-in user, or a redirect to the landing page for the action to return. */
async function requireUser(context: AppContext): Promise<User | Response> {
  return await currentUser(context.request) ?? redirect(routes.home.href());
}

function absolute(context: AppContext, path: string): string {
  return `${publicOrigin(context.request)}${path}`;
}

function apiError(error: unknown): Response {
  if (error instanceof TaskError) {
    return Response.json({ error: error.message }, {
      status: error.status,
      headers: CORS,
    });
  }
  console.error(error);
  return Response.json({ error: "Internal error" }, {
    status: 500,
    headers: CORS,
  });
}

function formError(error: unknown): Response {
  if (error instanceof TaskError) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
}

/** The API is a credential in a URL, not a cookie, so any origin may call it. */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
};

// --- pages ----------------------------------------------------------------------

const pages = createController(routes, {
  actions: {
    async home(context) {
      const user = await currentUser(context.request);
      if (!user) {
        return page(
          context,
          { title: APP_NAME, description: TAGLINE, hydrate: true },
          <Landing idpOrigin={config().idpOrigin} />,
        );
      }
      const tasks = await allTasks(user.id);
      return page(
        context,
        { title: APP_NAME, hydrate: true },
        <Home
          counts={await listCounts(user.id)}
          tasks={tasks.map(({ id, content, list, created_at, updated_at }) => ({
            id,
            content,
            list,
            created_at,
            updated_at,
          }))}
          quickApiUrl={absolute(
            context,
            routes.api.create.href({ list: "inbox" }),
          )}
          apiToken={user.apiToken}
          idpOrigin={config().idpOrigin}
        />,
      );
    },

    async swipe(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      const list = context.params.list;
      if (!SWIPE_LISTS.includes(list as never) || !isListName(list)) {
        return notFound();
      }
      const from = context.url.searchParams.get("from");
      const tasks = await tasksInList(user.id, list);
      return page(
        context,
        { title: `${list.toUpperCase()} — ${APP_NAME}`, hydrate: true },
        <Swipe
          tasks={tasks.map(({ id, content }) => ({ id, content }))}
          list={list}
          from={isListName(from) ? from : null}
          token={user.apiToken}
        />,
      );
    },

    async done(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      const tasks = await doneTasks(user.id);
      return page(
        context,
        { title: `Done — ${APP_NAME}`, hydrate: false },
        <Done
          tasks={tasks.map(({ id, content, updated_at }) => ({
            id,
            content,
            updated_at,
          }))}
        />,
      );
    },

    async rotateToken(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      await rotateApiToken(user.id);
      return redirect(routes.home.href());
    },

    jwks: () => jwks(),

    serviceWorker: () => serveStatic("sw.js", "no-cache"),

    manifest: () => serveStatic("manifest.webmanifest"),

    static: (context) => serveStatic(context.params.path),
  },
});

// --- tasks: the task page, and the forms on the pages ---------------------------

const taskController = createController(routes.tasks, {
  actions: {
    async create(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      const form = await context.request.formData();
      try {
        await createTask(user.id, "inbox", form.get("content"));
      } catch (error) {
        return formError(error);
      }
      return redirect(routes.home.href());
    },

    async show(context) {
      const task = await findTask(context.params.taskId);
      if (!task) return notFound();
      const user = await currentUser(context.request);
      const owner = user?.id === task.user_id ? user : null;
      const logs = await taskHistory(task.id);
      return page(
        context,
        {
          title: `${task.content} | ${APP_NAME}`,
          description: `List: ${task.list.toUpperCase()}`,
          hydrate: owner !== null,
        },
        <TaskPage
          task={{ id: task.id, content: task.content, list: task.list }}
          logs={logs.map(({ id, from_list, to_list, created_at }) => ({
            id,
            from_list,
            to_list,
            created_at,
          }))}
          api={owner
            ? {
              url: absolute(
                context,
                routes.api.update.href({ taskId: task.id }),
              ),
              token: owner.apiToken,
            }
            : null}
        />,
      );
    },

    async update(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      const { taskId } = context.params;
      const form = await context.request.formData();
      const list = form.get("list");
      const content = form.get("content");
      try {
        await updateTask(user.id, taskId, {
          list: isListName(list) ? list : undefined,
          content: typeof content === "string" ? content : undefined,
          push: false,
        }, absolute(context, routes.tasks.show.href({ taskId })));
      } catch (error) {
        return formError(error);
      }
      return redirect(routes.tasks.show.href({ taskId }));
    },

    async deleteLog(context) {
      const user = await requireUser(context);
      if (user instanceof Response) return user;
      const { taskId, logId } = context.params;
      try {
        await deleteLog(user.id, taskId, logId);
      } catch (error) {
        return formError(error);
      }
      return redirect(routes.tasks.show.href({ taskId }));
    },
  },
});

// --- auth ---------------------------------------------------------------------

const authController = createController(routes.auth, {
  actions: {
    callback: (context) =>
      page(
        context,
        { title: `Signing in — ${APP_NAME}`, hydrate: true },
        <Callback idpOrigin={config().idpOrigin} />,
      ),

    async session(context) {
      try {
        const cookie = await signIn(context.request);
        return new Response(null, {
          status: 204,
          headers: { "set-cookie": cookie },
        });
      } catch (error) {
        if (error instanceof SignInError) {
          return new Response(error.message, { status: 401 });
        }
        throw error;
      }
    },

    async logout() {
      return new Response(null, {
        status: 204,
        headers: { "set-cookie": await signOut() },
      });
    },
  },
});

// --- api: for scripts, authorized by a bearer token --------------------------------

/**
 * The user an API request is authorized as, from `Authorization: Bearer <token>`.
 *
 * @returns The user, or the `401` to answer with
 */
async function apiUser(context: AppContext): Promise<User | Response> {
  const [scheme, token] = (context.request.headers.get("authorization") ?? "")
    .split(" ");
  const user = scheme?.toLowerCase() === "bearer" && token
    ? await userByToken(token)
    : null;
  if (user) return user;
  return Response.json({ error: "A valid API token is required" }, {
    status: 401,
    headers: { ...CORS, "www-authenticate": "Bearer" },
  });
}

const apiController = createController(routes.api, {
  actions: {
    async create(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      const { list } = context.params;
      if (!isOpenList(list)) return apiError(new TaskError("Invalid list"));
      try {
        // JSON `{ "content": "…" }`, or the text itself as the body.
        const type = context.request.headers.get("content-type") ?? "";
        const content = type.includes("application/json")
          ? (await context.request.json().catch(() => null))?.content
          : await context.request.text();
        const taskId = await createTask(user.id, list, content);
        return Response.json({ success: true, taskId }, { headers: CORS });
      } catch (error) {
        return apiError(error);
      }
    },

    async update(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      const { taskId } = context.params;
      try {
        const body = await context.request.json().catch(() => null) as
          | Record<string, unknown>
          | null;
        if (!body || typeof body !== "object") {
          throw new TaskError("Expected a JSON body");
        }
        if (body.list !== undefined && !isListName(body.list)) {
          throw new TaskError("Invalid list");
        }
        const update: TaskUpdate = {
          list: body.list as TaskUpdate["list"],
          content: typeof body.content === "string" ? body.content : undefined,
          push: body.push !== false,
        };
        await updateTask(
          user.id,
          taskId,
          update,
          absolute(context, routes.tasks.show.href({ taskId })),
        );
        return Response.json({ success: true }, { headers: CORS });
      } catch (error) {
        return apiError(error);
      }
    },

    async deleteLog(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      try {
        await deleteLog(user.id, context.params.taskId, context.params.logId);
        return Response.json({ success: true }, { headers: CORS });
      } catch (error) {
        return apiError(error);
      }
    },
  },
});

/**
 * Builds the app.
 *
 * @param scripts Where the client bundle is, on this host
 * @param serveAssets Serves `/assets/*` — in development, where nothing else does
 * @returns A router; its `fetch` is the whole server
 */
export function createApp(
  scripts: Scripts,
  serveAssets?: (request: Request) => Promise<Response | null>,
) {
  clientRuntime = scripts.runtime;
  const router = makeRouter(scripts);
  router.map(routes, pages);
  router.map(routes.tasks, taskController);
  router.map(routes.auth, authController);
  router.map(routes.api, apiController);
  router.options(
    "/api/*path",
    () => new Response(null, { status: 204, headers: CORS }),
  );
  if (serveAssets) {
    router.get(
      "/assets/*path",
      async ({ request }) => await serveAssets(request) ?? notFound(),
    );
  }
  return router;
}
