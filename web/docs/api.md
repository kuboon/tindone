# tindone API

Read, add and move tasks from scripts, shortcuts and other apps.

## Authentication

Every request carries your API token in an `Authorization` header:

```http
Authorization: Bearer <token>
```

The token is shown in the API box on the home page and on each task page, and can be regenerated
from the home page ("API token" → "Regenerate token"). Regenerating it stops every script using the
old one.

A missing or unknown token is answered with `401 Unauthorized` and `WWW-Authenticate: Bearer`.

All endpoints live under `https://gtd.kbn.one/api` and allow cross-origin requests, so `fetch` from
a browser page on another origin works too.

## Lists

| Name      | Meaning                                                   |
| --------- | --------------------------------------------------------- |
| `inbox`   | Captured, not yet processed                               |
| `now`     | Doing it now                                              |
| `next`    | Next actions                                              |
| `waiting` | Waiting on someone or something                           |
| `done`    | Finished — a task can be moved here, but not created here |

## Errors

Errors are JSON with a single `error` field:

```json
{ "error": "Content must be 1-100 chars" }
```

| Status | When                                                |
| ------ | --------------------------------------------------- |
| `400`  | The body or a parameter is invalid                  |
| `401`  | The token is missing or unknown                     |
| `404`  | The task does not exist, or belongs to someone else |

## List tasks

```http
GET /api/:list
```

`:list` is `inbox`, `now`, `next`, `waiting` or `done`.

Open lists come in swipe order — least recently moved first. `done` comes most recently finished
first. Times are Unix milliseconds.

**Response** `200`

```json
{
  "tasks": [
    {
      "id": "s_oJakMbNZbie87G2g1RWg",
      "content": "buy milk",
      "list": "inbox",
      "created_at": 1790200335883,
      "updated_at": 1790200335883
    }
  ]
}
```

```sh
curl https://gtd.kbn.one/api/inbox -H "Authorization: Bearer <token>"
```

## Add a task

```http
POST /api/:list
```

`:list` is `inbox`, `now`, `next` or `waiting`.

The body is either the task's text itself, or JSON with a `content` field:

| Content-Type       | Body                        |
| ------------------ | --------------------------- |
| `text/plain`       | `buy milk`                  |
| `application/json` | `{ "content": "buy milk" }` |

The text is trimmed and must be 1–100 characters.

**Response** `200`

```json
{ "success": true, "taskId": "s_oJakMbNZbie87G2g1RWg" }
```

```sh
curl -X POST https://gtd.kbn.one/api/inbox \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: text/plain" \
  -d 'buy milk'
```

## Update a task

```http
PATCH /api/tasks/:taskId
```

`:taskId` is the last part of the task page's URL (`/tasks/<taskId>`), or the `taskId` returned when
the task was added.

The body is JSON with at least one of `list` and `content`:

| Field     | Type    | Meaning                                                                 |
| --------- | ------- | ----------------------------------------------------------------------- |
| `list`    | string  | Move the task to this list: `inbox`, `now`, `next`, `waiting` or `done` |
| `content` | string  | Replace the task's text; trimmed, 1–100 characters                      |
| `push`    | boolean | Send a push notification for the move. Default `true`                   |

Every move is recorded in the task's history. When `list` is given and `push` is not `false`, every
device you registered for notifications (the 🔔 on the home page) gets "<task> moved to <list>",
which opens the task when tapped. Moves made in the app itself never notify.

**Response** `200`

```json
{ "success": true }
```

```sh
curl -X PATCH https://gtd.kbn.one/api/tasks/<taskId> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"list":"done"}'
```

```js
await fetch("https://gtd.kbn.one/api/tasks/<taskId>", {
  method: "PATCH",
  headers: {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ list: "now", content: "buy oat milk", push: false }),
});
```

## Delete a history line

```http
DELETE /api/tasks/:taskId/logs/:logId
```

Removes one line from a task's history. The task itself is not changed.

**Response** `200`

```json
{ "success": true }
```
