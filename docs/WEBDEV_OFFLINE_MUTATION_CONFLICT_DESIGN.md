# WebDev Offline Mutation Queue And Conflict Handling Design

**状态**: Draft for Product Owner review
**日期**: 2026-07-11
**依据**: D-046, D-047, D-048, `docs/WEBDEV_INTERFACE_CONTRACTS.md`, `docs/WEBDEV_DATA_AUTHORITY_MATRIX.md`

> 本文定义 WebDev 后续离线写入队列和冲突处理方向。它不是当前 v1 实施批准，不改变 D-047 / D-048 已确认的 v1 行为：WebDev v1 离线时仍阻止编辑当前数据。

## 1. Purpose

当前 WebDev v1 已形成在线优先写入路径：

- Cloudflare D1 是 canonical source。
- Web App 通过 Repository 调 Worker API。
- IndexedDB 作为 local read cache。
- 离线时读取缓存，但写入被阻止。

下一阶段需要回答的问题是：未来如何在不破坏 Cloud canonical data 的前提下，尽量恢复 TimeWhere 的离线可用性。

本文给出目标设计：

- 用户离线时可以记录明确的本地写入意图。
- 写入意图进入本地 mutation queue，而不是直接改变 Cloud canonical state。
- 联网后按顺序、安全、幂等地重放到 Worker。
- Worker 依据 entity revision 和 field-level base values 判断能否自动合并。
- 无法安全合并时生成 conflict record，并要求用户明确处理。

## 2. Non Goals

本设计不批准：

- 当前 v1 立即允许离线写入。
- 直接把 IndexedDB 恢复为事实数据源。
- 静默 last-write-wins 覆盖 Cloud 数据。
- 在 Browser Extension 第一阶段实现完整离线队列。
- 改造旧 Google Drive Sync 机制。
- 部署 Cloudflare 资源或迁移生产数据。

## 3. Principles

| Principle | Meaning |
|---|---|
| Cloud remains canonical | D1 中的已确认实体状态始终是权威事实。 |
| Offline writes are intents | 离线写入是待提交意图，不是已确认事实。 |
| No silent overwrite | 任何可能覆盖他端用户修改的操作必须进入冲突。 |
| Idempotent replay | 同一 mutation 重试不能重复创建或重复应用。 |
| Field-aware merge | 能安全判断字段互不冲突时允许自动合并；否则交给用户。 |
| Local privacy boundary | 本地队列不得包含 token、cookie、OAuth secret、本地私密路径。 |
| Derived data stays derived | Daily Settle / Calendar projection / Reminder 状态不应作为用户离线写入直接排队。 |

## 4. Local Storage Model

未来 IndexedDB 至少需要四类本地表。名称是建议，不是最终 schema。

| Local table | Role | Cloud sync |
|---|---|---|
| `tw_cache_entities` | 最近一次 Cloud-confirmed entity cache。 | 从 Cloud 拉取，不作为事实上行。 |
| `tw_offline_mutations` | 离线或失败后待重放的 mutation queue。 | 通过 `/sync/mutations` 重放。 |
| `tw_conflict_cache` | 最近冲突详情的本地显示缓存。 | 从 Cloud conflict records 拉取。 |
| `tw_sync_meta` | cursor、device id、last successful replay time、schema version。 | 只同步必要 cursor，不含 secret。 |

`tw_offline_mutations` 建议字段：

```ts
type OfflineMutation = {
  mutation_id: string;       // client-generated UUID, idempotency key
  account_id: string;
  device_id: string;
  entity_type: 'task' | 'calendar_event' | 'container' | 'plan' | 'bucket' | 'label' | 'settings';
  entity_id: string;         // stable id or client-generated temp id for create
  operation: 'create' | 'update' | 'delete' | 'complete' | 'reopen';
  base_revision: string | null;
  base_values: Record<string, unknown>;
  patch: Record<string, unknown>;
  field_paths: string[];
  created_at: string;
  last_attempt_at?: string;
  attempt_count: number;
  status: 'queued' | 'replaying' | 'applied' | 'conflict' | 'rejected';
};
```

## 5. Mutation Capture

Repository write methods become responsible for deciding the write path:

```text
Online
  -> send directly to Worker with base_revision
  -> update local cache from Worker response

Offline
  -> validate locally against known schema
  -> create OfflineMutation
  -> update UI as pending local intent
  -> do not mark Cloud data as confirmed
```

UI should distinguish:

- confirmed Cloud state;
- pending local changes;
- failed/rejected local changes;
- conflicts that require user action.

Pending local changes may be displayed optimistically, but must carry a visible pending marker. A pending mutation must not be treated as successfully synced.

## 6. Replay Flow

When network and account session are available:

```text
Repository / Sync service detects queued mutations
  -> batches mutations in created_at sequence
  -> POST /sync/mutations
  -> Worker validates account/session/device
  -> Worker checks idempotency by mutation_id
  -> Worker compares base_revision / base_values against D1
  -> Worker applies safe mutations inside D1 transaction
  -> Worker returns applied / conflict / rejected results
  -> client updates local cache and queue status
```

Batch replay must be resumable. If mutation N fails with a conflict, later independent mutations may continue only when they do not depend on the conflicted entity. Otherwise they remain queued behind the conflict.

## 7. Worker API Direction

Recommended future endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /sync/changes?cursor=` | Pull Cloud-confirmed changes for local cache refresh. |
| `POST /sync/mutations` | Replay queued mutations with idempotency and conflict detection. |
| `GET /sync/mutations/:id` | Inspect mutation outcome for diagnostics. |
| `GET /sync/conflicts` | List unresolved conflicts. |
| `GET /sync/conflicts/:id` | Read full conflict detail. |
| `POST /sync/conflicts/:id/resolve` | Resolve by keep cloud / apply local / manual merge. |

The existing `/sync/status` should later expose:

- queue length;
- oldest queued mutation age;
- replay status;
- conflict count;
- last successful replay;
- last failure reason, redacted.

## 8. Conflict Detection Rules

Worker conflict detection should use entity revision plus field-level comparison.

### 8.1 No Conflict

No conflict when:

- `base_revision` still matches current Cloud revision;
- or Cloud revision changed, but the mutation touches fields that have not changed since `base_values`;
- or the operation is known commutative and safe, such as adding a new label relation when no delete occurred.

### 8.2 Conflict

Create a conflict when:

- the same field changed locally and in Cloud since `base_revision`;
- local delete targets an entity that changed in Cloud after `base_revision`;
- Cloud delete/tombstone exists and local mutation tries to update the entity;
- recurrence series structure changed on one device while another device edited generated instance rules;
- ManageBac source-controlled fields differ from local mutation;
- relationship targets no longer exist or now belong to another account scope.

### 8.3 Reject

Reject without conflict when:

- mutation is malformed;
- user/session/account does not own the entity;
- field is not user-editable;
- schema version is unsupported;
- mutation contains forbidden private fields.

Rejected mutations should remain locally visible with a recoverable diagnostic, but should not be retried automatically until user or app version changes.

## 9. Entity-Specific Rules

| Entity | Offline mutation policy |
|---|---|
| Task | Allow create/update/complete/reopen/delete after future approval. Use field-level conflict detection. |
| ManageBac source task | Allow only local execution fields from D-036. Source facts remain read-only and reject if queued. |
| Recurrence | Treat series-level edit and instance-level edit as separate mutation scopes. Conflicts escalate to recurrence review. |
| CalendarEvent | Allow create/update/delete. Repeating event changes conflict if recurrence rule changed on both sides. |
| Container | Allow create/update/disable/reorder. Schedule/time overlap is validation, not necessarily conflict. |
| Plan/Bucket/Label | Allow CRUD where relationships remain valid. Delete conflicts when tasks still reference the entity. |
| Settings | Allow selected product settings only. Runtime settings stay local-only. |
| ReminderState | Local-only. Do not enqueue as Cloud mutation. |
| Daily Settle projection | Derived read model. Do not enqueue projection changes. |

## 10. Conflict UX Direction

Conflict handling should live in Web App Settings first, with contextual links from Tasks / Calendar when relevant.

Minimum conflict list:

- entity type;
- safe display title;
- local pending change summary;
- current Cloud value summary;
- changed fields;
- created_at / detected_at;
- available actions.

Minimum actions:

| Action | Meaning |
|---|---|
| Keep Cloud | Discard local pending mutation and refresh cache. |
| Apply Local | Apply local change only if Worker can still validate it at resolution time. |
| Manual Merge | User chooses field values, Worker writes merged patch with latest revision. |
| Dismiss rejected | Remove a rejected invalid mutation after user acknowledges. |

Conflict UI must not display tokens, OAuth details, cookies, local private paths, or raw snapshot payloads.

## 11. Ordering And Dependency

Each mutation should carry:

- `mutation_id`;
- `client_sequence`;
- `depends_on_mutation_ids`;
- `entity_id`;
- optional `temp_id_resolution`.

Create flows may use client-generated stable ids where possible. If the server generates or remaps an id, the replay response must include a temp-id mapping so later queued mutations can be rewritten safely.

## 12. Implementation Roadmap

This roadmap requires separate Product Owner approval before code work.

| Phase | Goal | Acceptance evidence |
|---|---|---|
| 0 | Keep v1 offline writes blocked. | Current `offline_write_blocked` tests remain green. |
| 1 | Add Cloud revision/change cursor fields to D1/API. | Scaffolded on 2026-07-11 with D1 `sync_changes`, Worker `/sync/changes`, and local integration coverage. |
| 2 | Add local queue schema behind disabled feature flag. | Scaffolded on 2026-07-11 with disabled queue helper, repository state access, and tests proving user-facing offline writes remain blocked. |
| 3 | Add disabled/internal mutation replay contract skeleton. | Scaffolded on 2026-07-11 with Worker `/sync/mutations`, validation, private-field rejection, and tests proving no user offline write is applied. |
| 4 | Add Cloud conflict record scaffold for future offline mutation conflicts. | Scaffolded on 2026-07-11 with D1 `sync_conflicts`, Worker `/sync/conflicts` read APIs, status exposure, and tests. No conflict resolution UI or offline write enablement is exposed. |
| 5 | Define Task-only replay activation gates and field-level conflict checks while disabled. | Scaffolded on 2026-07-11 with `/sync/mutations` returning Task-only gate diagnostics, field-level conflict preview, ManageBac source-field blocking, and tests proving no offline write is applied. |
| 6 | Add disabled Task replay outcome persistence hooks. | Scaffolded on 2026-07-11 with D1 `sync_mutation_outcomes`, metadata-only outcome recording, `GET /sync/mutations` diagnostics, and tests proving raw mutation payloads are not persisted. |
| 7 | Add Task replay transaction skeleton behind an internal disabled gate. | Scaffolded on 2026-07-11 with `/sync/mutations` returning apply/conflict/reject branch steps while `writes_enabled=false`, and tests proving no user offline write is applied. |
| 8 | Add disabled client-side replay diagnostics in Pages Settings. | Scaffolded on 2026-07-11 with Settings reading sanitized `/sync/mutations` outcomes and Task replay gates while offline writes remain blocked. |
| 9 | Add disabled sync conflict diagnostics in Pages Settings. | Scaffolded on 2026-07-11 with Settings reading sanitized `/sync/conflicts` records before any conflict resolution UI is approved. |
| 10 | Add an internal disabled Task replay dry-run endpoint or command. | Scaffolded on 2026-07-11 with `POST /sync/mutations/dry-run` joining replay gates with existing outcomes/conflicts without applying writes or persisting diagnostics. |
| 11 | Add dry-run conflict creation preview. | Scaffolded on 2026-07-11 with conflict candidates reporting exact sanitized conflict record shape while `would_persist=false`. |
| 12 | Add Task replay apply-plan preview for apply candidates. | Scaffolded on 2026-07-11 with dry-run reporting sanitized patch fields and future D1 write steps while `would_persist=false`. |
| 13 | Add replay readiness summary endpoint/card. | Scaffolded on 2026-07-11 with `POST /sync/mutations/readiness-summary` and Pages Settings aggregating candidate counts, blocked reasons, and apply/conflict preview counts while replay remains disabled. |
| 14 | Enable offline queue for Task only. | Offline create/update/complete replay tests and conflict tests pass after Product Owner approval. |
| 15 | Add Calendar and Structure entities. | Entity-specific conflict tests pass. |
| 16 | Add Settings and cross-entity relationship validation. | Settings/runtime boundary tests pass. |
| 17 | Promote conflict UI from diagnostics to user workflow. | Manual merge / keep cloud / apply local acceptance tests pass. |

## 13. Test Requirements For Future Build&Test

Future implementation must include tests for:

- offline write creates queued mutation and does not claim Cloud success;
- replay is idempotent by `mutation_id`;
- same-field stale revision creates conflict;
- disjoint-field stale revision can merge safely;
- delete/update conflict is not silently overwritten;
- ManageBac source fields are rejected while execution fields are allowed;
- recurrence series conflicts are preserved;
- rejected mutation does not retry forever;
- conflict resolution re-validates against latest Cloud revision;
- queue and conflict records exclude secrets/private identifiers.

## 14. Open Product Owner Decisions

Before enabling offline writes, Product Owner should decide:

1. Whether optimistic pending UI is acceptable, or whether offline edits should stay in a separate draft state until replay succeeds.
2. Whether Task offline writes should be enabled before Calendar/Container writes.
3. How much manual merge UI is required for v1.5 versus simple keep-cloud/apply-local actions.
4. Queue retention policy for applied/rejected mutations.
5. Whether Desktop Runtime should expose additional network/background wake hooks, or whether Web App foreground replay is sufficient.

## 15. Current Recommendation

Do not enable offline writes in the next implementation package.

Recommended next Build&Test package:

1. Define the Product Owner review gate checklist for enabling Task-only replay, including required acceptance data from readiness summaries and conflict preview diagnostics.
2. Keep offline writes blocked in all user-facing UI.
3. Do not expose new conflict resolution UI beyond the current migration conflict review until Product Owner approves the offline-write user workflow.

This moves the architecture toward offline-capable WebDev without prematurely creating conflict-heavy user behavior.
