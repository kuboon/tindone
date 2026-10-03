/**
 * The app, wired by hand — the same on both hosts.
 *
 * `client/routes.ts` names every URL; this file maps each one to what answers it, with a controller
 * per route map. A controller has to name an action for every route in its map — leave one out and
 * the router throws while it is being built, rather than serving an app with a hole in it.
 *
 * Pages are ordinary Remix components in `client/pages/`, rendered into `client/layout.tsx` by
 * `context.render` from the `render({ assets })` middleware. A page depends on nothing about who
 * asks for it — the only server value it is handed is the IdP's origin — so every page is the same
 * HTML for everyone. `build.ts` renders each one ahead of time into Static Assets, where Cloudflare
 * serves and caches it without running the Worker. The islands on a page fetch the user's data
 * from `/api/…` once they are in the browser.
 *
 * `/api/…` knows who is calling from the request alone (`auth.ts`): a script sends its API token
 * as `Authorization: Bearer <token>`, the browser id.kbn.one's token and a DPoP proof. The swipe
 * deck and a `curl` hit the same endpoints, so they are one code path.
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
import { hastToRemix } from "@kuboon/md/hast_to_remix.ts";

import {
  AuthError,
  dpopUser,
  rotateApiToken,
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
import { Doc as DocPage } from "../client/pages/doc.tsx";
import { Done } from "../client/pages/done.tsx";
import { Swipe } from "../client/pages/swipe.tsx";
import { HomeApp } from "../client/islands/home_app.tsx";
import { TaskApp } from "../client/islands/task_app.tsx";

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

/** A Markdown document from `docs/`, converted ahead of time by `docs.ts`. */
export interface Doc {
  title: string;
  hast: Parameters<typeof hastToRemix>[0] & { type: "root" };
}

/** Every document, by slug: `docs/api.md` is `api`, served at `/docs/api`. */
export type Docs = Record<string, Doc>;

/** Set by {@link createApp}. */
let docs: Docs = {};

/** Set by {@link createApp}: the runtime a hydrating page loads. */
let clientRuntime: Scripts["runtime"];

interface PageOptions {
  title: string;
  description?: string;
  /** Whether the page places an island, so the shell loads the client runtime. */
  hydrate: boolean;
}

/**
 * Renders a page into the shell. The same for everyone, so any cache may keep it — but only until
 * it checks again: a page names the client bundle's hashed URLs, which a deploy replaces.
 * (Prerendered pages are served by Static Assets, which revalidates them the same way.)
 */
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
  response.headers.set("cache-control", "public, max-age=0, must-revalidate");
  return response;
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

/** The API's credentials travel in headers, never in a cookie, so any origin may call it. */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, dpop",
};

/** For what the API answers about one user: no shared cache may keep it. */
const PRIVATE = { ...CORS, "cache-control": "private, no-store" };

// --- pages ----------------------------------------------------------------------

const pages = createController(routes, {
  actions: {
    home: (context) =>
      page(
        context,
        { title: APP_NAME, description: TAGLINE, hydrate: true },
        <HomeApp idpOrigin={config().idpOrigin} />,
      ),

    swipe(context) {
      const list = context.params.list;
      if (!SWIPE_LISTS.includes(list as never) || !isListName(list)) {
        return notFound();
      }
      return page(
        context,
        { title: `${list.toUpperCase()} — ${APP_NAME}`, hydrate: true },
        <Swipe list={list} idpOrigin={config().idpOrigin} />,
      );
    },

    done: (context) =>
      page(
        context,
        { title: `Done — ${APP_NAME}`, hydrate: true },
        <Done idpOrigin={config().idpOrigin} />,
      ),

    doc(context) {
      const doc = Object.hasOwn(docs, context.params.slug)
        ? docs[context.params.slug]
        : undefined;
      if (!doc) return notFound();
      const response = context.render(
        <Layout title={`${doc.title} — ${APP_NAME}`} script={null}>
          <DocPage>{hastToRemix(doc.hast)}</DocPage>
        </Layout>,
      );
      response.headers.set("cache-control", "public, max-age=300");
      return response;
    },

    jwks: () => jwks(),

    serviceWorker: () => serveStatic("sw.js", "no-cache"),

    manifest: () => serveStatic("manifest.webmanifest"),

    static: (context) => serveStatic(context.params.path),
  },
});

// --- tasks: one page for every task ---------------------------------------------

const taskController = createController(routes.tasks, {
  actions: {
    show: (context) =>
      page(
        context,
        { title: `Task — ${APP_NAME}`, hydrate: true },
        <TaskApp idpOrigin={config().idpOrigin} />,
      ),
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
  },
});

// --- api: for scripts and for the islands ------------------------------------------

/**
 * The user an API request is made as: `Authorization: Bearer <api token>` from a script, or
 * `Authorization: DPoP <id.kbn.one token>` with a proof from the browser (see `auth.ts`).
 *
 * @returns The user, or the `401` to answer with
 */
async function apiUser(context: AppContext): Promise<User | Response> {
  const [scheme, token] = (context.request.headers.get("authorization") ?? "")
    .split(" ");
  if (scheme?.toLowerCase() === "dpop") {
    try {
      return await dpopUser(context.request);
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      return Response.json({ error: error.message }, {
        status: 401,
        headers: { ...CORS, "www-authenticate": "DPoP" },
      });
    }
  }
  const user = scheme?.toLowerCase() === "bearer" && token
    ? await userByToken(token)
    : null;
  if (user) return user;
  return Response.json({ error: "A valid API token is required" }, {
    status: 401,
    headers: { ...CORS, "www-authenticate": "Bearer" },
  });
}

type ApiTask = Awaited<ReturnType<typeof allTasks>>[number];

function taskJson({ id, content, list, created_at, updated_at }: ApiTask) {
  return { id, content, list, created_at, updated_at };
}

const apiController = createController(routes.api, {
  actions: {
    async me(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      return Response.json({ apiToken: user.apiToken }, { headers: PRIVATE });
    },

    async rotateToken(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      return Response.json({ apiToken: await rotateApiToken(user.id) }, {
        headers: PRIVATE,
      });
    },

    async all(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      return Response.json({
        tasks: (await allTasks(user.id)).map(taskJson),
      }, { headers: PRIVATE });
    },

    /**
     * A task page is shareable by its link, so the task and its history answer to anyone. A
     * credential, when sent, only decides `owner` — the controls the page shows.
     */
    async task(context) {
      const task = await findTask(context.params.taskId);
      if (!task) return apiError(new TaskError("Task not found", 404));
      let owner = false;
      if (context.request.headers.has("authorization")) {
        const user = await apiUser(context);
        if (user instanceof Response) return user;
        owner = user.id === task.user_id;
      }
      const logs = await taskHistory(task.id);
      return Response.json({
        task: { id: task.id, content: task.content, list: task.list },
        logs: logs.map(({ id, from_list, to_list, created_at }) => ({
          id,
          from_list,
          to_list,
          created_at,
        })),
        owner,
      }, { headers: PRIVATE });
    },

    async list(context) {
      const user = await apiUser(context);
      if (user instanceof Response) return user;
      const { list } = context.params;
      if (!isListName(list)) return apiError(new TaskError("Invalid list"));
      const found = list === "done"
        ? await doneTasks(user.id)
        : await tasksInList(user.id, list);
      return Response.json({ tasks: found.map(taskJson) }, {
        headers: PRIVATE,
      });
    },

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
 * @param options.docs The converted `docs/` (`docs.ts`), served at `/docs/:slug`
 * @param options.serveAssets Serves `/assets/*` — in development, where nothing else does
 * @returns A router; its `fetch` is the whole server
 */
export function createApp(
  scripts: Scripts,
  options: {
    docs?: Docs;
    serveAssets?: (request: Request) => Promise<Response | null>;
  } = {},
) {
  const { serveAssets } = options;
  clientRuntime = scripts.runtime;
  docs = options.docs ?? {};
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
