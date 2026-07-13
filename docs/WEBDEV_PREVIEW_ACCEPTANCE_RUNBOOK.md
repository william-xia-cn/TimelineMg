# WebDev Preview Acceptance Runbook

**状态**: Gate A readiness runbook
**适用阶段**: Phase 9 internal preview acceptance
**边界**: 本文不批准创建真实 Cloudflare 资源、不部署、不发布、不记录 secret。

本文定义 TimeWhere Cloud-first / Web-first 进入真实 `preview` 环境后的验收步骤和证据格式。只有 Product Owner 明确批准 Gate A 后，才能创建或绑定真实 dev / preview Cloudflare 资源、配置真实 Google SSO 和执行外部 preview 验收。

## 1. 前置 Gate

执行本文前必须确认：

- Gate A 已批准：允许创建或绑定真实 Cloudflare `dev` / `preview` 资源。
- 仍未批准 Gate B：Task replay 写 Cloud 不对用户开放。
- 仍未批准 Gate C：Calendar / Container / Settings replay 不实现。
- 仍未批准 Gate D：Browser Extension 第一阶段范围不实施。
- 仍未批准 Gate E：Desktop Runtime 不生成内部包、不签名、不分发。
- 仍未批准 Gate R：不做 prod deployment、tag、GitHub Release、CWS 或正式发布。

## 2. 环境与资源核对

`preview` 环境应使用独立 Cloudflare 资源，不复用 `dev` 或未来 `prod`：

| 资源类型 | preview 命名建议 | 验收证据 |
|---|---|---|
| Worker | `timewhere-preview-api` | Worker route 可访问 `/health`。 |
| Pages | `timewhere-preview-web` | Web App 可加载并指向 preview Worker。 |
| D1 | `timewhere-preview-db` | migrations 已执行，核心表存在。 |
| R2 | `timewhere-preview-snapshots` | migration snapshot 可写入和读取 metadata。 |
| KV | `timewhere-preview-cache` | 只用于短期状态，不作为事实数据源。 |

证据只记录资源名称和环境类别，不记录 Cloudflare account id、database id、API token 或私密路径。

Gate A 批准后，资源准备与部署入口：

```powershell
npm run webdev:preview:preflight
npm run webdev:cloudflare:provision
npm run webdev:preview:deploy
npm run webdev:preview:headers-smoke
npm run webdev:preview:smoke
```

执行约束：

- `webdev:cloudflare:provision` 只创建或确认 `dev / preview` 的 D1、R2、KV、Pages 项目，不创建 `prod`。
- 真实 D1 / KV resource id 只写入 ignored 的 `.wrangler/` 本地文件，不写入 `workers/wrangler.toml`。
- `webdev:preview:deploy` 使用 generated local config 部署 preview Worker 和 preview Pages，并先应用 preview D1 migrations。
- `webdev:preview:smoke` 只针对 preview Worker / Pages / D1 / R2 / KV 做基础验收；它会写入并清理 preview R2 临时对象和 preview KV 临时 key，不触碰 prod。
- Google SSO 必须使用 stable Pages preview origin，例如 `https://timewhere-preview-web.pages.dev`。不要把 Cloudflare Pages 的 hash deployment URL 配进 Google Web OAuth JavaScript origin，否则会触发 `origin_mismatch`。
- Google Web OAuth public client id 通过 shell 环境提供；不要写入仓库文档。
- 若 Cloudflare auth 或 Google Web OAuth client 尚未配置，命令应失败并停下，不得改为 prod 或临时公开发布。

## 3. Google SSO Preview 验收

Google 在 WebDev v1 只作为 SSO / OIDC 身份入口：

- Web App 使用 Google Identity Services 获取 ID token。
- Worker 校验 ID token 后创建 TimeWhere account session。
- Web App 本地只保存 TimeWhere session，不保存 Google token。
- Logout 只删除 TimeWhere session，不撤销 Google 授权。

验收步骤：

1. 打开 stable preview Web App。
2. 使用测试 Google 账户完成 SSO。
3. 验证 `/account/me` 返回当前 TimeWhere account profile。
4. 执行 `POST /auth/session/refresh`，确认旧 session 被撤销、新 session 可用。
5. 执行 logout，确认需要重新登录才能访问受保护 API。

证据要求：

- 只记录脱敏 account id 后缀或测试别名。
- 不记录邮箱、ID token、cookie、Authorization header 或浏览器 profile path。

## 4. 自动迁移验收

自动迁移目标：

- 用户完成 Google SSO 后自动检测 legacy IndexedDB。
- 本地生成 snapshot 并做私密字段检查。
- Worker 创建 migration run。
- R2 保存原始 snapshot。
- D1 写入 canonical tables。
- 重复上传同一 snapshot 不重复创建数据。
- 云端已有变更时进入 migration conflict，不静默覆盖。

验收用例：

| 用例 | 预期结果 |
---|---|
| 首次迁移 legacy snapshot | `migration_run.status=completed` 或 `conflict`，D1 出现 canonical rows。 |
| 重复提交同一 snapshot | 返回既有 migration run 或幂等结果，不重复创建 Task/Event/Container。 |
| legacy snapshot 含 runtime/account/private keys | Worker 拒绝或清理，返回结构化原因。 |
| 云端记录已被修改 | 创建 migration conflict，不覆盖 Cloud canonical row。 |
| 选择 `use_local` 解决迁移冲突 | 应用本地 row 后关闭对应 conflict。 |
| 选择 `skip` / `use_cloud` | 不覆盖 Cloud canonical row。 |

## 5. 核心业务 Preview Smoke

Preview smoke 必须覆盖：

- Dashboard：Today projection、current container、projected current work。
- Tasks：create、detail update、complete、reopen、delete。
- Calendar：event create、edit、delete、date projection、repeat payload preview。
- Settings：product settings read/write；Plan/Bucket/Label/Container create/edit/delete。
- Reminder：Dashboard reminder state UI，不要求系统通知。
- ManageBac continuity：迁移后的 source fact fields 仍只读；本地执行字段可作为 canonical task fields 保存。
- Sync foundation：`/sync/changes` cursor 可读取 Cloud-confirmed changes。
- Conflict review：migration conflicts 和 Task sync conflicts 不显示空白面板。

## 6. Desktop Runtime Preview Smoke

不生成安装包、不签名、不分发。只允许本地 opt-in runtime smoke：

```powershell
$env:TIMEWHERE_DESKTOP_RUNTIME_MODE = 'webdev'
$env:TIMEWHERE_WEB_APP_URL = '<preview-pages-url>'
npm run electron:dev
```

本地非 preview 证据可先运行：

```powershell
npm run webdev:preview:preflight
npm run webdev:acceptance:local
npm run webdev:desktop:smoke
```

验收点：

- Electron 加载 preview Web App。
- `#dashboard`、`#tasks`、`#calendar`、`#settings` 可通过窗口路由落到对应视图。
- 非 Web App 同源导航通过外部浏览器打开或被阻止。
- 托盘、窗口显示/隐藏、通知 bridge、external link bridge 不承载业务逻辑。

Gate E 未批准前，不生成内部包、不签名、不公证、不自动更新。

## 7. 必跑命令

本地 baseline：

```powershell
npm run webdev:verify
npm run webdev:preview:preflight
npm run webdev:ui:walkthrough
npm test
git diff --check
```

Preview 环境命令需在 Gate A 批准后补充真实 `preview` URL 与环境变量，但不得把真实 secret 写入 repo。
Gate A 已执行后可运行：

```powershell
npm run webdev:preview:smoke
npm run webdev:preview:headers-smoke
npm run webdev:preview:core-smoke
npm run webdev:preview:ui-smoke
npm run webdev:preview:acceptance
```

这些 smoke 只输出资源类别、环境和 PASS/FAIL，不输出 Cloudflare resource id、OAuth secret、token 或账号邮箱。`webdev:preview:headers-smoke` 只读取 stable Pages preview 的响应头，验证 CSP、基础安全头、根 HTML no-store 和 hashed asset immutable cache，不需要 Cloudflare auth。`webdev:preview:core-smoke` 使用临时 smoke account/session 验证 preview Worker API，包括核心 CRUD / sync 读路径以及 migration import / idempotent retry / conflict / resolution；它会在结束时清理测试数据，不读取浏览器 Google session。`webdev:preview:ui-smoke` 使用同类临时 smoke session 打开 stable Pages preview，验证 Dashboard / Tasks / Calendar / Settings UI 能读取 preview Cloud 数据，并在结束时清理测试数据。

## 8. Latest Local Evidence

2026-07-12 本地 / preview 基础验收结果：

- `npm run webdev:preview:smoke`: PASS。覆盖 preview Worker `/health`、stable Pages load、remote D1 core table query、preview R2 temporary object write/read/delete、preview KV temporary key write/read/delete；不触碰 prod。
- `npm run webdev:preview:headers-smoke`: PASS。覆盖 stable Pages preview CSP、基础安全响应头、根 HTML `Cache-Control: no-store` 和 hashed JS asset immutable cache；不需要 Cloudflare auth。
- `npm run webdev:preview:core-smoke`: PASS。覆盖 Account status/profile、Structure create、Task create/update/list、Calendar create/update/list、Settings update、Sync bootstrap、Sync changes、Migration import、幂等重试、迁移冲突生成与解决；结束后通过 API / cleanup 删除 smoke 实体、临时迁移 snapshot 和 smoke account，smoke account count 为 0。
- `npm run webdev:preview:ui-smoke`: PASS。使用临时 smoke account/session 打开 stable Pages preview，验证 Dashboard、Tasks、Calendar、Settings 能读取 preview Worker 数据；结束后清理 smoke account。
- `npm run webdev:preview:acceptance`: PASS。串联 preview foundation、core API、UI smoke，作为 Gate A preview acceptance 复核入口；不触碰 prod。
- `npm run webdev:verify`: PASS。覆盖 plan-state、preview preflight、scaffold、migration adapter、business parity、offline queue、Pages build、Worker typecheck、local integration。
- `npm run webdev:ui:walkthrough`: PASS。覆盖 Dashboard、Tasks、Calendar、Settings、migration panel、pending queue、sync conflict panel、structure editor 和 `/sync/changes` read-cache refresh。
- `npm run webdev:desktop:smoke`: PASS。Electron WebDev runtime mode 可加载本地 Web App 并干净退出 smoke。
- `npm test`: PASS。
- `git diff --check`: PASS，仅出现 Windows line-ending warning；无 whitespace error。
- Sensitive pattern scan: PASS。未在 repo-scoped files 中发现 token、cookie、OAuth secret、Cloudflare API token 或 private key pattern。

尚未完成的 preview 验收：

- 真实 Google SSO 人工 UI 复核可作为后续人工验收补充；当前自动化 preview UI smoke 使用临时 smoke session 覆盖 Pages UI 与 preview Worker 数据路径。
- Gate B/C/D/E/R 相关动作仍未批准，不得在本验收中顺带启用。

## 9. Preview Risk Register / Known Limitations

| 风险 / 限制 | 当前处理 | 升级条件 |
|---|---|---|
| Preview smoke 主要使用临时 smoke session | 自动化覆盖 Worker API 与 Pages UI 数据路径；真实 Google SSO 人工 UI 复核作为补充证据。 | SSO UI、session refresh、logout 任一手工步骤失败。 |
| Task replay 写 Cloud 未开放 | Gate B 未批准，`writes_enabled=false`，只允许 dry-run / readiness / diagnostics。 | Product Owner 单独批准 Gate B。 |
| Calendar / Container / Settings replay 未实现 | Gate C 未批准，非 Task replay 继续阻断。 | Product Owner 单独批准 Gate C。 |
| Desktop Runtime 未打包分发 | Gate E 未批准，只做 local / preview URL smoke，不生成安装包。 | Product Owner 单独批准 Gate E。 |
| Browser Extension 不作为第一阶段主产品 | Gate D 未批准，不实现 Extension replay 或新发布路径。 | Product Owner 单独批准 Gate D。 |
| Prod 资源与正式发布未批准 | Gate R 未批准，preview 证据不能直接视为 prod release approval。 | Product Owner 单独批准 Gate R。 |
| R2 snapshot retention / D1 backup cadence 仍是 prod readiness 项 | Preview 只验证 snapshot write/read/delete 与 migration import；正式保留策略留在 Gate R 评审。 | 进入 prod readiness package 审批。 |
| Observability 仍是 readiness，不是 production monitoring | 当前只验证结构化状态、错误边界和 smoke；正式告警策略留在 Gate R。 | 出现 preview 5xx、migration failure 或 auth failure 无法解释。 |

## 10. Preview Rollback / Cleanup Plan

Preview 回滚以“不触碰 prod、不丢失调查证据、可停止新写入”为原则：

1. 暂停继续执行 `webdev:preview:deploy`、`webdev:preview:core-smoke`、`webdev:preview:ui-smoke`。
2. 若 Pages UI 回归失败，回退到上一可用 Git commit 后重新执行 preview deploy；不要改 prod，也不要把 preview hash URL 写入 Google OAuth origin。
3. 若 Worker API 回归失败，先保留 preview D1 / R2 / KV 状态用于诊断，再用上一可用 commit 重新部署 preview Worker。
4. 若 migration import 产生重复或静默覆盖迹象，停止迁移测试，保留 R2 snapshot 和 migration run / conflict rows，等待 Product Owner 评审；不得清空证据后继续重试。
5. 若 smoke 临时数据未清理，使用 smoke 脚本内置 cleanup 路径或按 smoke account/session 前缀清理 preview 数据；清理过程不记录真实 account email。
6. 若 Google SSO origin 配置错误，只修正 preview stable origin；不得临时改成 prod origin 或公开发布域名。
7. 所有回滚动作只允许作用于 `dev / preview`，不得创建 prod resource、tag、GitHub Release、CWS 或 Desktop package。

## 11. Evidence Template

```text
Preview Acceptance Evidence
Date:
Branch:
Commit:
Environment: preview

Local checks:
- npm run webdev:verify:
- npm run webdev:ui:walkthrough:
- npm test:
- git diff --check:

Cloud checks:
- Pages headers:
- Worker /health:
- D1 migrations:
- R2 snapshot write:
- KV short-state check:
- Pages app load:

SSO checks:
- Login:
- /account/me:
- Session refresh:
- Logout:

Migration checks:
- First migration:
- Idempotent retry:
- Private-field rejection:
- Conflict creation:
- Conflict resolution:

Core business checks:
- Dashboard:
- Tasks:
- Calendar:
- Settings:
- Reminder:
- ManageBac continuity:
- Sync change feed:
- Conflict review:

Desktop runtime smoke:
- WebDev runtime mode:
- Route hash views:
- External navigation guard:

Known limitations:
- Gate B not approved:
- Gate C not approved:
- Gate D not approved:
- Gate E not approved:
- Gate R not approved:
```

## 12. Stop Conditions

立即停止并回报 Product Owner：

- 需要记录或提交任何 secret、token、cookie、真实账号邮箱、Cloudflare resource id。
- 需要启用 user-facing replay 写 Cloud。
- 需要创建 prod 资源或发布产物。
- 需要改变 Google Sync / Drive / Tasks / Calendar connector 边界。
- preview migration 出现静默覆盖或不可解释的数据重复。
