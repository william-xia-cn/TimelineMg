# WebDev Observability / Backup Readiness Runbook

**状态**: Gate R readiness runbook
**适用阶段**: Phase 10 prod release readiness
**边界**: 本文只定义观察、备份、恢复和告警准备要求；不批准 prod resource creation、prod deployment、public release、GitHub Release、tag、merge、CWS、Desktop 分发或 replay 写入。

## 1. 目标

进入 Gate R 前，TimeWhere WebDev 必须能说明：

- Worker API 错误如何被结构化观察；
- migration run / migration conflict / sync conflict 如何被定位；
- D1 canonical data 如何备份、恢复和回滚；
- R2 migration snapshot 如何保留、校验和清理；
- 哪些日志、错误和 evidence 不允许记录 private data。

## 2. 当前代码证据

当前可复核的实现证据：

- `workers/src/http.ts`
  - 所有成功响应包含 `status: "ok"` 和 `server_time`。
  - 所有错误响应包含 `status: "error"`、`error.code`、`error.message`、`error.retryable` 和 `server_time`。
  - 未分类异常映射为 `internal_error`，不回传原始异常文本。
- `workers/src/migration.ts`
  - migration snapshot 拒绝 `token / cookie / secret / password / private_path / local_path` 类字段。
  - 原始 migration snapshot 写入 R2 `SNAPSHOTS`。
  - D1 `migration_runs` 记录 run status、snapshot hash、snapshot R2 key 和 counts。
  - D1 `migration_conflicts` 记录冲突详情和 resolution audit。
- `workers/src/syncConflicts.ts`
  - sync conflict 记录拒绝 private fields。
  - D1 `sync_conflicts` 支持 list / get / resolve，并限制当前阶段只处理单 Task conflict。
- `workers/src/sync.ts`
  - D1 `sync_changes` 提供 change cursor，用于 read cache refresh 与 replay readiness evidence。

## 3. Gate R 前必须确认的观察信号

### Worker / API

- 5xx count 和 `internal_error` count。
- 4xx auth/session 类错误：
  - `missing_session`
  - `invalid_session`
  - `session_expired`
  - `auth_not_configured`
  - `google_audience_mismatch`
- migration 类错误：
  - `invalid_snapshot`
  - `invalid_snapshot_data`
  - `snapshot_contains_private_data`
  - `migration_conflict_not_found`
- sync/replay 类错误：
  - `offline_mutation_private_data`
  - `sync_conflict_private_data`
  - `sync_conflict_not_found`
  - `sync_conflict_resolution_scope_blocked`

### D1

- `migration_runs` by status / age。
- unresolved `migration_conflicts` count / oldest age。
- unresolved `sync_conflicts` count / oldest age。
- latest `sync_changes.sequence` per active account。
- failed or stalled migration runs。

### R2

- migration snapshot object count。
- snapshot age distribution。
- snapshot object exists for each completed or conflicted migration run。
- orphan snapshot count。

## 4. 备份与恢复准备

Gate R 前应准备但不在本轮执行：

- D1 schema-only export rehearsal。
- D1 full export rehearsal。
- Restore drill against non-prod database。
- R2 migration snapshot listing and sample restore drill。
- Rollback package that references:
  - previous Worker commit；
  - previous Pages deployment；
  - D1 export artifact；
  - R2 snapshot retention window；
  - replay kill switch state。

所有 export / restore evidence 必须脱敏，不记录真实账号邮箱、token、cookie、OAuth secret、Cloudflare resource id 或本地私密路径。

## 5. 建议命令模板

以下命令是 Gate R 评审时的模板，不应在未批准 prod 前执行：

```powershell
# D1 schema export template
wrangler d1 export <prod-db-name> --remote --output <redacted-schema-backup.sql> --no-data

# D1 full export template
wrangler d1 export <prod-db-name> --remote --output <redacted-full-backup.sql>

# R2 snapshot sample restore template
wrangler r2 object get <prod-snapshot-bucket>/<snapshot-key> --file <redacted-snapshot.json>
```

注意：

- `<prod-db-name>`、`<prod-snapshot-bucket>`、`<snapshot-key>` 和输出文件路径不得写入仓库。
- 真实 Cloudflare resource id 不进入 repo。
- 不通过命令参数传递 secret。

## 6. 日志与隐私规则

日志和 evidence 禁止记录：

- token；
- cookie；
- OAuth secret；
- Google ID token；
- refresh token；
- 真实账号邮箱；
- Cloudflare API token；
- Cloudflare account id / database id / namespace id；
- raw private migration snapshot；
- 本地用户私密路径。

允许记录：

- error code；
- HTTP status；
- retryable flag；
- redacted environment name；
- migration run status；
- conflict counts；
- age bucket；
- commit SHA；
- command PASS / FAIL。

## 7. Stop Conditions

立即停止并回报 Product Owner：

- migration import 产生重复 canonical rows 或静默覆盖迹象；
- D1 export / restore drill 失败且无法解释；
- R2 snapshot 缺失或无法读取；
- logs / evidence 需要记录 private data 才能排查；
- replay writes 需要为 prod 用户启用；
- prod resource creation 或 prod deploy 在 Gate R 前成为必要条件。

## 8. Readiness Command

Gate R 前可运行只读静态门禁：

```powershell
npm run webdev:observability:readiness
```

该命令只检查仓库中的 Worker error envelope、migration/sync conflict privacy guards、D1/R2/KV prod placeholder、observability/backup runbook、prod readiness checklist 和 package scripts。它不会调用 Wrangler、不会创建 Cloudflare resource、不会读取 `.wrangler/`、不会导出 D1、不会读取 R2、不会部署或发布。
