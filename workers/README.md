# TimeWhere Workers Scaffold

本目录是 WebDev v1 的 Cloudflare Workers 初始 scaffold。

## 定位

- `workers/src/` 提供 Cloud API 入口、Google SSO 会话、Repository 路由和自动迁移入口雏形。
- `/auth/google`、`/auth/session/refresh`、`/auth/session`、`/account/me`、`/account/profile` 与 `/account/status` 构成第一版 WebDev Cloud session 生命周期；刷新 session 只轮换 TimeWhere bearer，不接触 Google token；注销 session 不撤销 Google 授权；workspace/profile 是 TimeWhere 本地业务空间资料，不写回 Google。
- `/tasks` 已有第一版 Cloud-backed CRUD：返回规范化 Task DTO，支持查询筛选、创建、更新、完成/重开和软删除。
- `/calendar/events` 已有第一版 Cloud-backed CRUD：返回规范化 Event DTO，支持日期/搜索筛选、创建、更新和软删除。
- `/plans`、`/labels`、`/buckets` 与 `/containers` 已有第一版 Cloud-backed CRUD：用于 WebDev 结构数据、Daily Settle 后续投影和本地 cache 的 canonical 来源。
- `/sync/changes` 提供 Cloud-confirmed change cursor，用于未来离线 mutation replay 的安全基础；当前 v1 仍阻止离线写入。
- `/sync/bootstrap` 提供只读 Cloud canonical snapshot 和最新 cursor，用于 Web App / Desktop Runtime 初始化本地 read cache；它不应用 mutation，也不启用离线写 Cloud。
- `/sync/mutations` 默认仍是 disabled/internal contract skeleton：校验 mutation batch，定义 Task-only replay activation gate、字段级冲突预判、内部 transaction skeleton，记录 metadata-only outcome，并拒绝 replay，不应用任何用户离线写入。Product Owner 已批准 Phase 1 test-only server write contract；只有请求体显式带 `test_only_task_replay_enabled: true` 的内部测试调用才会应用 Task-only replay。
- `GET /sync/mutations` 与 `GET /sync/mutations/:id` 提供 replay outcome 诊断读取；当前只保存状态、原因、门禁结果和尝试次数，不保存 patch/base/cloud 原始内容。
- `POST /sync/mutations/dry-run` 提供 internal disabled dry-run：复用 gate / transaction skeleton，并关联已有 outcome / conflict 记录；对 apply candidate 返回不落库的 sanitized apply plan，对 conflict candidate 返回不落库的 sanitized conflict preview；不写入、不创建 conflict、不应用用户离线写入。
- `/sync/conflicts` 提供未来离线 mutation conflict records：当前可列出/读取记录，并支持单条 Task conflict 的 `keep_cloud` / `discard_local` / `later` metadata action；不会用本地值覆盖 Cloud。
- `/sync/replay-safety` 提供 Phase 4 replay safety gate：读取环境、kill switch 和 blocker 状态；默认 kill switch 打开、local/dev replay flag 关闭、prod replay 永远不允许。
- `workers/migrations/0001_initial.sql` 定义第一版 D1 canonical schema。
- `workers/migrations/` 按 Wrangler D1 migrations 顺序管理 schema 变化。`0001_initial.sql` 是基线，后续字段或表变更必须新增 `0002+` 迁移文件，不直接改写历史迁移。
- `wrangler.toml` 只保留资源命名、binding 和环境结构，不提交真实 Cloudflare resource id、API token、Google secret 或账号信息。

## 环境

环境按 `dev` / `preview` / `prod` 分开：

| 环境 | Worker | D1 | R2 | KV |
|---|---|---|---|---|
| dev | `timewhere-dev-api` | `timewhere-dev-db` | `timewhere-dev-snapshots` | `timewhere-dev-cache` |
| preview | `timewhere-preview-api` | `timewhere-preview-db` | `timewhere-preview-snapshots` | `timewhere-preview-cache` |
| prod | `timewhere-api` | `timewhere-db` | `timewhere-snapshots` | `timewhere-cache` |

## 本地命令

```powershell
npm run webdev:local:prepare
npm --prefix workers run dev
npm --prefix workers run typecheck
npm --prefix workers run deploy:dev
npm --prefix workers run deploy:preview
npm --prefix workers run deploy:prod
```

`webdev:local:prepare` 会在本机 Wrangler D1 state 中按顺序应用未执行过的 `workers/migrations/*.sql`，并写入一组本地假数据。默认本地请求可使用：

```text
Authorization: Bearer timewhere-local-dev-session
```

该值只用于本地 smoke / integration test，不是生产凭据，不应部署到远端环境。

新增 D1 schema 时使用新迁移文件，例如 `workers/migrations/0002_*.sql`。本地迁移通过 Wrangler 的 migration ledger 只应用未执行过的文件；integration test 使用隔离的 `--persist-to` state，避免旧本地数据库锁定或 schema 残留影响结果。

部署命令需要先在 Cloudflare 中创建对应资源，并在本地或 CI 的私有配置中填写 resource id。本仓库不保存这些 id。

## Sync replay diagnostics

当前 `/sync/mutations` 对普通调用仍然处于 `disabled_v1`，不会应用用户离线写入。Product Owner 已批准的 Phase 1 test-only server write contract 仅允许内部测试请求通过 `test_only_task_replay_enabled: true` 验证 Task replay apply / conflict / reject / idempotency；Pages UI 仍不启用离线写入。辅助诊断接口只用于开发审查：

- `POST /sync/mutations/dry-run`：复用 replay gate，预览 apply plan / conflict record shape，不写入 outcome、conflict 或业务数据。
- `POST /sync/mutations/readiness-summary`：基于 dry-run 聚合 candidate counts、blocked reasons、apply/conflict preview counts，用于评估未来是否具备开启 replay 的条件。
- `POST /sync/mutations/enablement-simulation`：用 readiness summary 和显式 policy/evidence 输入模拟 Gate A-E 是否满足；结果仍是 `simulation_only`，不会开启写入。
- `GET /sync/replay-safety`：输出 Phase 4 safety gate，证明 kill switch、环境门禁和 prod 禁止状态；结果始终 `writes_enabled=false`。

这些接口不启用用户离线写入，不保存 raw mutation payload，不绕过 Product Owner approval。test-only replay 只用于本地/内部 integration evidence，不代表 UX、offline queue 或生产 replay 已获批。

## 当前边界

- 不创建 Cloudflare 资源。
- 不部署 Worker。
- 不实现公开发布。
- 不记录 token、cookie、OAuth secret、账号邮箱或本地私密路径。
- Google 在本阶段只作为 SSO / OIDC 身份提供方，不承载 Google Drive Sync 设计。
