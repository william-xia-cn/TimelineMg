# WebDev Automatic Migration Plan

**状态**: Draft for Product Owner review
**日期**: 2026-07-10
**依据**: D-046, D-047, `docs/WEBDEV_DATA_AUTHORITY_MATRIX.md`

> 本文定义自动迁移方向，不批准实现迁移工具、不修改现有 IndexedDB schema、不部署 Cloud。

## 1. Product Requirement

Product Owner 决策：

- 数据迁移必须尽量自动完成。
- 用户不应被要求手工导出/导入。
- 登录 Google SSO 后，旧客户端或 Desktop migration bridge 自动检测本地 IndexedDB 并迁移。
- 迁移后本地 IndexedDB 不立即删除，继续作为只读缓存、回滚安全副本或旧客户端兼容数据；WebDev v1 离线时禁止修改当前数据。

## 2. Migration Entry

```text
User opens new Web App / Desktop Runtime
  -> User completes Google SSO
  -> App checks local IndexedDB migration marker
  -> If unmigrated local data exists, create local snapshot
  -> Upload snapshot to Worker /migration/runs
  -> Worker stores raw snapshot in R2
  -> Worker writes canonical entities into D1
  -> App shows migration result and starts normal Cloud-backed operation
```

Browser Extension migration is deferred unless separately approved.

## 3. Local Snapshot

Snapshot should include entity tables needed for product continuity:

- plans;
- buckets;
- labels;
- tasks;
- containers;
- events;
- habits if still supported by target product;
- selected product settings;
- source metadata needed for ManageBac/MatrixView continuity.

Snapshot must exclude:

- tokens;
- cookies;
- OAuth secrets;
- local private paths;
- desktop runtime settings;
- debug logs unless separately approved.

## 4. Idempotency

Automatic migration must be safe to retry.

Minimum idempotency inputs:

- account id from Google SSO mapping;
- source runtime type;
- source local database id if available;
- snapshot hash;
- stable entity ids;
- migration run id.

Retrying the same snapshot must not duplicate tasks, containers, events, plans, buckets, or labels.

## 5. Multi-device Merge

When several old devices migrate into the same account:

- stable entity id match means same entity;
- tombstones must be respected if present;
- newer user edits can win only when conflict rules are explicit;
- unresolved ambiguity becomes `MigrationConflict`;
- conflicts are stored in D1 and shown through the WebDev Migration conflict review UI; changed cloud records are not silently overwritten during import.

No device should silently overwrite another device's user data during automatic migration.

## 6. Failure And Recovery

| Failure | Required behavior |
|---|---|
| Google SSO fails | Do not start migration; keep local data untouched. |
| Snapshot validation fails | Stop, show diagnostic, keep local data untouched. |
| Upload fails | Retry with backoff; allow user to continue read-only local cache mode if available. |
| Worker write partially fails | Migration run remains recoverable; retry must resume idempotently. |
| Conflict occurs | Store conflict detail; do not silently overwrite. |
| User closes app | Resume migration check on next open. |

## 7. Post-migration State

After successful migration:

- D1 becomes canonical for migrated entities.
- IndexedDB remains local read cache and rollback safety copy.
- Local migration marker records completion for that account/source snapshot.
- Old Google Drive Sync state is not treated as target architecture truth.
- Offline edits remain blocked in WebDev v1 until a later offline mutation/conflict design is approved.
- Any future deletion of old local data requires separate Product Owner approval.

## 8. Acceptance Criteria For Future Implementation

Future Build&Test implementation must prove:

- automatic migration starts after Google SSO without manual export/import;
- local data remains untouched on failure;
- retrying the same snapshot is idempotent;
- migrated counts match expected source counts;
- conflict details are recoverable;
- no tokens, cookies, OAuth secrets, or private paths enter migration snapshots.


