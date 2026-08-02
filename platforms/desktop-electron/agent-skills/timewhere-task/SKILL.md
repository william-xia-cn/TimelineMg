---
name: timewhere-task
description: Use this skill when the user asks Codex to read, create, update, delete, start, complete, reopen, inspect, or summarize TimeWhere tasks through the local TimeWhere Desktop MCP server. Triggers include TimeWhere task CRUD, Dashboard current task, today tasks, active profile tasks, and requests mentioning timewhere-desktop-mcp or TimeWhere Desktop task tools.
---

# TimeWhere Task

Use the local TimeWhere Desktop MCP server as the standard task interface. Do not use Chrome UI automation, do not read IndexedDB files directly, and do not ask for arbitrary user/profile IDs.

## Required Runtime

- MCP server id: `timewhere_desktop_mcp` when registered as a global Codex MCP server.
- MCP display/serverInfo name: `timewhere-desktop-mcp`.
- Standard server script: `D:\Codex\ThmeWhere-Master\platforms\desktop-electron\mcp-stdio-server.js`.
- TimeWhere Desktop must be open and renderer ready before task calls can succeed.
- Tools operate only on the current TimeWhere Desktop active profile.

If MCP tools are not available in the current Codex session, say that the TimeWhere MCP registration is not exposed to this session and verify with `codex mcp list --json`; do not fall back to editing local database files.

## Tool Map

Use these tools when available:

- `timewhere_tasks_list`: list task summaries.
- `timewhere_task_get`: fetch one task detail.
- `timewhere_task_create`: create a manual task.
- `timewhere_task_update`: patch allowed fields.
- `timewhere_task_delete`: delete a task after explicit confirmation.
- `timewhere_task_start`: mark in progress.
- `timewhere_task_complete`: mark completed.
- `timewhere_task_reopen`: reopen as not started.

When the tool namespace is required by the host, prefer the server namespace matching `timewhere_desktop_mcp`.

## Read Workflow

For Dashboard/current-task requests:

1. Call `timewhere_tasks_list` with `{ "progress": "in_progress", "limit": 10 }`.
2. If no in-progress task exists, call `timewhere_tasks_list` with a narrow date filter for today if the user asked for today's work.
3. Use `timewhere_task_get` only when the user needs details such as notes, description, checklist, or full editable fields.

Return concise summaries with `id`, `title`, progress/status, due/start date, schedule time, priority, source, and notes only when useful.

## Write Rules

For every write call, provide a stable `idempotency_key`. Use a deterministic key when replaying the same requested action, for example `codex:<purpose>:<task_id-or-title>:<date-or-timestamp>`.

Allowed write tools:

- Create: `timewhere_task_create` requires `title`, `due_date`, and `idempotency_key`; source is fixed by TimeWhere as `manual`.
- Update: `timewhere_task_update` requires `task_id`, `patch`, and `idempotency_key`.
- Start/complete/reopen: require `task_id` and `idempotency_key`.
- Delete: requires `task_id`, `user_confirmed: true`, and `idempotency_key`.

Never delete unless the user has explicitly confirmed deletion in the current conversation. If the user asks to delete but has not clearly confirmed, ask for confirmation and include the task title/id you intend to delete.

## Field Boundaries

Editable local fields include title, dates, schedule, duration, priority, progress, notes/description, checklist, labels, and bucket where supported by the MCP tool.

Respect source protections:

- Manual tasks can be created and edited normally within the allowed fields.
- ManageBac/source-backed facts must not be overwritten if the MCP returns a source-facts protection error.
- Do not expose source URLs, credentials, cookies, account emails, private profile IDs, raw database rows, or sync internals unless the MCP intentionally returns sanitized fields.

## Error Handling

- `desktop_not_ready`: Tell the user to open TimeWhere Desktop and wait for it to finish loading, then retry.
- `profile_changed`: Tell the user the active profile changed and retry with a fresh request.
- missing `idempotency_key`: retry the write with a proper idempotency key.
- delete without `user_confirmed`: ask for explicit confirmation.
- source facts protected: explain that TimeWhere blocks editing imported/source-owned fields and offer an allowed local-field update instead.

## Safety Defaults

Prefer read-only calls unless the user clearly asks to modify tasks. Keep task output minimal and relevant. Do not use Chrome controls or browser clicks for CRUD when MCP is intended. Do not modify sync schema, Google Drive data, OAuth secrets, or IndexedDB schema.
