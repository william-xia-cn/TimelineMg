# WebDev Offline Mutation Queue And Conflict Handling Design

**状态**: Draft for Product Owner review
**日期**: 2026-07-11
**依据**: D-046, D-047, D-048, D-049, `docs/WEBDEV_INTERFACE_CONTRACTS.md`, `docs/WEBDEV_DATA_AUTHORITY_MATRIX.md`

> 本文定义 WebDev 后续离线写入队列和冲突处理方向。D-049 已批准 Task-only queued pending 的窄路径；当前仍不批准 prod replay、Calendar/Container/Settings replay、Browser Extension replay、本地覆盖云端、批量冲突处理或全实体 offline-first。

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
| 4 | Add Cloud conflict record scaffold for future offline mutation conflicts. | Scaffolded on 2026-07-11 with D1 `sync_conflicts`, Worker `/sync/conflicts` read APIs, status exposure, and tests. Phase 3 now adds single Task conflict resolution metadata actions only. |
| 5 | Define Task-only replay activation gates and field-level conflict checks while disabled. | Scaffolded on 2026-07-11 with `/sync/mutations` returning Task-only gate diagnostics, field-level conflict preview, ManageBac source-field blocking, and tests proving no offline write is applied. |
| 6 | Add disabled Task replay outcome persistence hooks. | Scaffolded on 2026-07-11 with D1 `sync_mutation_outcomes`, metadata-only outcome recording, `GET /sync/mutations` diagnostics, and tests proving raw mutation payloads are not persisted. |
| 7 | Add Task replay transaction skeleton behind an internal disabled gate. | Scaffolded on 2026-07-11 with `/sync/mutations` returning apply/conflict/reject branch steps while `writes_enabled=false`, and tests proving no user offline write is applied. |
| 8 | Add disabled client-side replay diagnostics in Pages Settings. | Scaffolded on 2026-07-11 with Settings reading sanitized `/sync/mutations` outcomes and Task replay gates while offline writes remain blocked. |
| 9 | Add sync conflict review in Pages Settings. | Started as diagnostics on 2026-07-11; Phase 3 now supports single Task `keep_cloud` / `discard_local` / `later` actions without applying local data to Cloud. |
| 10 | Add an internal disabled Task replay dry-run endpoint or command. | Scaffolded on 2026-07-11 with `POST /sync/mutations/dry-run` joining replay gates with existing outcomes/conflicts without applying writes or persisting diagnostics. |
| 11 | Add dry-run conflict creation preview. | Scaffolded on 2026-07-11 with conflict candidates reporting exact sanitized conflict record shape while `would_persist=false`. |
| 12 | Add Task replay apply-plan preview for apply candidates. | Scaffolded on 2026-07-11 with dry-run reporting sanitized patch fields and future D1 write steps while `would_persist=false`. |
| 13 | Add replay readiness summary endpoint/card. | Scaffolded on 2026-07-11 with `POST /sync/mutations/readiness-summary` and Pages Settings aggregating candidate counts, blocked reasons, and apply/conflict preview counts while replay remains disabled. |
| 14 | Add disabled Task replay enablement simulation. | Scaffolded on 2026-07-12 with `POST /sync/mutations/enablement-simulation` and a Settings preview card evaluating Gate A-E inputs while `writes_enabled=false`. |
| 15 | Add Phase 1 Task-only test replay server write contract. | Implemented after Product Owner approval: internal `test_only_task_replay_enabled` requests can apply safe Task mutations, persist same-field conflicts, reject protected/non-Task mutations, and prove idempotency. User-facing offline writes remain blocked. |
| 16 | Add Calendar and Structure entities. | Entity-specific conflict tests pass. |
| 17 | Add Settings and cross-entity relationship validation. | Settings/runtime boundary tests pass. |
| 18 | Promote conflict UI from diagnostics to user workflow. | Manual merge / keep cloud / apply local acceptance tests pass. |

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

## 15. Task-Only Replay Enablement Review Gate

Task-only replay must remain disabled until Product Owner explicitly approves moving from diagnostics to a real write path. The approval should be based on current readiness evidence, not on the existence of endpoint scaffolding alone.

### Gate A: Scope Lock

Before any replay write path is enabled:

- only `task` mutations are in scope;
- create/update/complete/reopen/delete semantics are listed explicitly;
- Calendar, Container, Structure, Settings, ReminderState, and migration conflicts remain out of scope;
- ManageBac source-controlled fields remain blocked;
- local execution fields are listed separately from source facts;
- no replay applies user data unless `writes_enabled=true` is introduced by a separately approved change.

### Gate B: Readiness Evidence

Build&Test must provide recent evidence from `POST /sync/mutations/readiness-summary` using representative offline mutation samples:

| Evidence | Required before approval |
|---|---|
| apply candidate count | Non-zero apply candidates for ordinary Task edits. |
| conflict candidate count | Same-field conflicts are visible as conflict candidates, not silently applied. |
| reject candidate count | Rejections are explainable by approved gate rules. |
| blocked reasons | Every blocked reason has a documented user-facing or developer-facing next step. |
| apply plan previews | Apply previews list sanitized patch fields and D1 transaction steps. |
| conflict previews | Conflict previews include sanitized local/cloud field deltas and no private data. |
| stored outcome count | Metadata-only outcome records remain useful and do not include raw mutation payloads. |
| stored conflict count | Existing conflict records can be listed and inspected before enabling resolution. |

### Gate C: Conflict Policy

Product Owner must approve the initial conflict policy:

- same-field stale updates create conflict records;
- disjoint-field stale updates may be auto-merge candidates only after review;
- delete/update conflicts must not silently choose either side;
- rejected mutations must not retry forever;
- conflict records must exclude tokens, cookies, account emails, OAuth secrets, local private paths, and raw full snapshots;
- user-facing conflict UI is not implied by enabling diagnostics.

### Gate D: UX And Offline Write Semantics

Product Owner must choose the user experience before queueing real offline edits:

- offline edits are either blocked, queued as pending, or stored as drafts;
- pending edits must be visibly marked and reversible;
- Cloud success must not be claimed until Worker confirms replay;
- failed replay must show clear retry / conflict / discard paths;
- Settings diagnostics must remain available for support.

### Gate E: Test And Safety Bar

The implementation package that first enables Task replay must include:

- unit tests for validation, allowed fields, private-field rejection, and ManageBac boundaries;
- integration tests proving idempotent replay by `mutation_id`;
- integration tests for apply, conflict, reject, retry, and no-duplicate-create flows;
- tests proving disabled non-Task entity replay remains blocked;
- tests proving local cache and Cloud D1 converge after successful replay;
- `npm run webdev:verify`;
- `npm test`;
- sensitive information scan over docs, Pages, Workers, and tests.

### Gate F: Explicit Non-Goals

Approval to enable Task-only replay does not approve:

- Calendar / Container / Settings replay;
- full offline-first UX;
- sync conflict resolution UI beyond the approved Task scope;
- Google Drive Sync changes;
- Desktop Runtime background sync changes;
- deployment, public release, tag, merge, or production Cloudflare resource changes.

## 16. Task-Only Replay Implementation Plan For PO Review

This section records the Product Owner-approved Phase 1 direction and the remaining implementation phases. It does not approve enabling user-facing offline writes, exposing replay UI, or replaying queued user mutations.

### Phase 1: Server Write Contract

Goal: implement the smallest test-only Worker write path needed to prove the Task replay contract can be safe.

Scope:

- Task mutations only.
- Allowed operations: `create`, `update`, `complete`, `reopen`, and `delete`.
- D1 transactions only; no partial batch success without explicit outcome records.
- Idempotency by `mutation_id`.
- Field whitelist aligned with the Task repository and source-boundary rules.
- ManageBac source-fact fields remain protected.
- Same-field stale updates create conflict records instead of silently overwriting Cloud data.
- Non-Task entities remain rejected with `entity_not_enabled`.

Required tests:

- duplicate `mutation_id` does not create duplicate records;
- allowed Task update applies once;
- stale same-field update creates a conflict record;
- protected fields are rejected;
- ManageBac protected source fields are rejected;
- disabled entity replay remains blocked;
- failed validation does not write partial data.

Hold point:

- Phase 1 was approved by the Product Owner and implemented as a test-only server write package.
- Phase 1 still does not enable Pages offline writes or user-facing mutation replay.

### Phase 2: Client Queue Activation For Task Only

Goal: connect the existing disabled local queue to Task repositories, but only after the UX semantics are approved.

Scope:

- Queue Task writes only when the user is offline or when Cloud write is unavailable.
- Mark queued edits as pending in the Web UI.
- Allow users to retry or discard pending edits.
- Do not claim Cloud success until Worker replay confirms the mutation.
- Keep Calendar, Containers, Settings, and migration conflicts out of this phase.

Hold point:

- Requires Product Owner approval for offline edit UX: blocked, queued pending, or draft mode.

### Phase 3: Conflict Surfacing

Goal: make Task replay conflicts diagnosable and allow the narrow Product Owner-approved single-conflict actions.

Scope:

- List sanitized conflict records from `/sync/conflicts`.
- Show entity type, operation, conflicting fields, local summary, Cloud summary, and suggested next step.
- Allow one Task conflict at a time to be marked `keep_cloud`, `discard_local`, or `later`.
- Do not expose raw mutation payloads, account emails, tokens, cookies, OAuth secrets, private local paths, or full snapshots.
- Do not auto-resolve delete/update conflicts.
- Do not provide apply-local / local-over-cloud resolution.

Hold point:

- Implemented under D-049 only for single Task conflicts; batch handling, non-Task conflicts, and local-over-cloud remain separate approvals.

### Phase 4: Safety And Rollback

Goal: keep Task replay reversible enough for internal testing.

Scope:

- Keep replay feature flags disabled by default.
- Add a runtime kill switch for replay apply.
- Keep history records for applied / rejected / conflict outcomes.
- Keep local queue records until replay outcome is confirmed.
- Document how to clear internal test queues without deleting canonical Cloud data.

### Phase 5: Explicit Hold Points

The following remain unapproved until Product Owner explicitly approves them:

- enabling offline writes in user-facing Web App flows;
- Calendar / Container / Settings replay;
- auto-merge of disjoint stale updates;
- conflict resolution UI with apply-local / local-over-cloud actions;
- Desktop Runtime background replay;
- Browser Extension replay;
- deployment to production Cloudflare resources;
- public release, tag, merge, or GitHub Release.

## 17. Current Recommendation

Continue from the completed Phase 2 queued pending and Phase 3 single Task conflict review work.

Recommended next Build&Test package:

1. Start Phase 4 local/dev replay production-gate preparation with a kill switch and replay safety evidence.
2. Keep prod replay disabled and avoid any Cloudflare prod deployment or public release.
3. Keep Calendar / Container / Settings replay, Browser Extension replay, batch conflict handling, and local-over-cloud actions out of scope until separately approved.


This moves the architecture toward offline-capable WebDev without prematurely creating conflict-heavy user behavior.
