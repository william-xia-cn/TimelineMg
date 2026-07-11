# TimeWhere Workers Scaffold

本目录是 WebDev v1 的 Cloudflare Workers 初始 scaffold。

## 定位

- `workers/src/` 提供 Cloud API 入口、Google SSO 会话、Repository 路由和自动迁移入口雏形。
- `/auth/google`、`/auth/session` 与 `/account/me` 构成第一版 WebDev Cloud session 生命周期；注销 session 不撤销 Google 授权。
- `/tasks` 已有第一版 Cloud-backed CRUD：返回规范化 Task DTO，支持查询筛选、创建、更新、完成/重开和软删除。
- `/calendar/events` 已有第一版 Cloud-backed CRUD：返回规范化 Event DTO，支持日期/搜索筛选、创建、更新和软删除。
- `/plans`、`/labels`、`/buckets` 与 `/containers` 已有第一版 Cloud-backed CRUD：用于 WebDev 结构数据、Daily Settle 后续投影和本地 cache 的 canonical 来源。
- `/sync/changes` 提供 Cloud-confirmed change cursor，用于未来离线 mutation replay 的安全基础；当前 v1 仍阻止离线写入。
- `/sync/mutations` 只有 disabled/internal contract skeleton：校验 mutation batch 并拒绝 replay，不应用任何用户离线写入。
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

## 当前边界

- 不创建 Cloudflare 资源。
- 不部署 Worker。
- 不实现公开发布。
- 不记录 token、cookie、OAuth secret、账号邮箱或本地私密路径。
- Google 在本阶段只作为 SSO / OIDC 身份提供方，不承载 Google Drive Sync 设计。


