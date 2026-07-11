# WebDev Data Authority Matrix

**状态**: Draft for Product Owner review
**日期**: 2026-07-10
**依据**: D-046, D-047

> 本文定义目标架构中的数据权威方向。它不是最终数据库 schema，不执行数据迁移。

## 1. Storage Roles

| Storage | Role | Not allowed |
|---|---|---|
| Cloudflare D1 | Canonical product data source for accounts, tasks, calendars, containers, settings, migration state. | 不存大文件归档，不存 raw local snapshot blob。 |
| Cloudflare R2 | Migration snapshot, export backup, larger archival payloads. | 不作为在线查询主库。 |
| Cloudflare KV | Cache, dedupe, short-lived runtime coordination. | 不作为事实数据源。 |
| IndexedDB | Local read cache, migration source, rollback safety copy. | v1 不允许离线修改当前数据；不再作为长期唯一权威数据源。 |
| Electron secure storage | Runtime secret/session protection only. | 不存业务数据。 |

## 2. Entity Authority Matrix

| Entity | Canonical authority | Local role | Migration rule |
|---|---|---|---|
| Account | D1 | session/cache only | Created or matched after Google SSO. |
| UserProfile | D1 | cache | Derived from account setup and user settings. |
| Plan | D1 | cache; online-only writes in v1 | Auto-migrate from IndexedDB plans. |
| Bucket | D1 | cache; online-only writes in v1 | Auto-migrate with plan relationship. |
| Label | D1 | cache; online-only writes in v1 | Auto-migrate with plan relationship. |
| Task | D1 | cache; online-only writes in v1 | Auto-migrate using stable task id where possible. |
| Container | D1 | cache; online-only writes in v1 | Auto-migrate using stable container id where possible. |
| CalendarEvent | D1 | cache; online-only writes in v1 | Auto-migrate using stable event id/source metadata where possible. |
| ProductSettings | D1 | cache | Auto-migrate selected product settings; runtime settings remain local. |
| ReminderState | Local runtime first | local only unless later approved | Do not migrate as canonical product data in v1. |
| MigrationRun | D1 metadata + R2 snapshot | cache status | Created automatically after Google SSO when local source exists. |
| MigrationConflict | D1 | cache/display | Created when auto merge cannot safely decide. |
| FutureOfflineMutation | Deferred | not active in v1 | Full offline mutation queue requires a later design. |

## 3. Settings Boundary

Cloud settings include product preferences that should follow the user:

- plan/task/calendar display preferences;
- reminder product preferences;
- default task duration and scheduling preferences;
- ManageBac source configuration only after privacy review.

Local-only settings include:

- desktop tray/window behavior;
- autostart;
- local runtime profile partition;
- OAuth or session storage internals;
- debugging flags;
- migration local checkpoint state.

## 4. Revision And Conflict Direction

Cloud entities should carry:

- stable id;
- account/workspace owner;
- created_at;
- updated_at;
- revision or version;
- deleted/tombstone status where needed;
- source metadata for imports.

Conflicts must not be silently overwritten. WebDev v1 blocks offline edits to current data, so ordinary offline-write conflicts should not be created. Automatic migration can still create conflict records, and user-facing resolution behavior requires a separate UX plan.

## 5. Privacy Boundary

The data authority model must not record:

- raw OAuth tokens;
- cookies;
- OAuth client secrets;
- account emails in public repo evidence;
- local private paths;
- full migration snapshots in docs or logs.

