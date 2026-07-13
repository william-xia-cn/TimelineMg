# WebDev 目标完成清单

**状态**: Active implementation checklist
**依据**: D-046, D-047, D-048, D-049

本文把 Cloud-first / Web-first 目标拆成可验收阶段。它记录当前完成状态、下一步实现边界和必须停下等待 Product Owner 批准的 gate。它不是公开发布批准，也不批准生产部署。

## 目标定义

TimeWhere WebDev v1 完成时应满足：

- Cloudflare D1 是 canonical data source。
- Web App 覆盖现有核心业务：Dashboard、Tasks、Calendar、Settings、Daily Settle、Reminder、ManageBac continuity。
- Google 仅作为 SSO / OIDC 身份提供方。
- 旧 IndexedDB 数据可在 Google SSO 后自动迁移到 Cloud。
- Desktop 退化为 Runtime，只承载 native capability。
- Browser Extension 退化为生态组件，第一阶段不作为主产品实现。

## 阶段状态

| Phase | 目标 | 当前状态 | 完成定义 |
|---|---|---|---|
| Phase 0 | 基线冻结与计划固化 | Complete | 本清单存在，`PROJECT_MASTER.md` / `TASK_BOARD.md` 指向同一 WebDev 状态，gate 边界明确。 |
| Phase 1 | Cloudflare dev / preview 环境落地 | Preview active under Gate A | `workers/wrangler.toml`、Worker vars example、Pages env example、资源命名和本地校验齐备；Gate A 已批准并执行 dev / preview 资源创建，真实 resource id 只保存在 ignored `.wrangler/` local state。 |
| Phase 2 | Google SSO 与账户会话 | Preview SSO smoke complete | Worker 支持 `POST /auth/google`、`POST /auth/session/refresh`、`DELETE /auth/session`、`GET /account/me`、`GET/PATCH /account/profile`、`GET /account/status`；Web App 只保存 TimeWhere session 与 workspace/profile，不保存 Google secret。Stable preview origin Google SSO smoke 已通过。 |
| Phase 3 | Cloud canonical schema 与 API 完整化 | Local preview complete | D1 schema 与核心实体 CRUD、revision、change feed、只读 bootstrap snapshot、统一错误 envelope、安全 runtime/gate 状态均有测试覆盖。 |
| Phase 4 | 自动迁移闭环 | Preview smoke backed | legacy IndexedDB snapshot、R2 raw snapshot、D1 import、migration conflict、idempotent retry 均有本地 integration evidence；Gate A preview core smoke 已覆盖 migration import、幂等重试、冲突生成和解决。 |
| Phase 5 | Web App 完整业务覆盖 | Complete for local preview | Dashboard / Tasks / Calendar / Settings / projection / reminder / migration conflict / structure editing 已有本地实现；`npm run webdev:ui:walkthrough` 提供可重复本地 UI walkthrough。真实 preview cloud evidence 仍归 Phase 9 / Gate A。 |
| Phase 6 | 离线与同步 v1 收敛 | Guarded with Gate B/C packets | Web App 已用只读 bootstrap 初始化本地 read cache，并可按 `/sync/changes` cursor 增量刷新 Task / Calendar / Structure / Settings cache；Task-only pending 已可见且 hydrate / 增量应用都会保留 pending；`docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md` / `npm run webdev:gate-b:readiness` 和 `docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md` / `npm run webdev:gate-c:readiness` 提供 Gate B/C 审批前证据；真正 replay 写 Cloud、非 Task replay、local-over-cloud 均保持 gate。 |
| Phase 7 | Desktop Runtime 重定位 | Opt-in scaffolded with Gate E packet | Electron 增加 `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` / `TIMEWHERE_WEB_APP_URL` WebDev runtime mode，可加载 Web App 并保留 native bridge；`docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md` 和 `npm run webdev:desktop:readiness` 静态验证 Runtime 边界、导航 guard、preload native bridge 和 Gate E 禁止打包边界；`npm run webdev:desktop:smoke` 可本地启动 Worker/Pages 并让 Electron smoke 加载 Web App；默认仍是 legacy extension shell。内部包、签名、公证、自动更新和分发仍归 Gate E。 |
| Phase 8 | Browser Extension 生态化 | Deferred with Gate D packet | 第一阶段范围另行批准；不实现 Extension replay。`docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md` 和 `npm run webdev:extension:readiness` 静态验证 Extension 仍是 Gate D 后续生态组件，当前 legacy MV3 shell 未接入 WebDev replay / Cloudflare endpoint，也不新增 CWS/release 动作。 |
| Phase 9 | 内部 preview 验收 | Preview acceptance hardened under Gate A | `docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md` 已定义 preview 验收步骤和证据模板；preview Worker / Pages / Google SSO smoke 已通过；`npm run webdev:preview:headers-smoke` 验证 stable Pages preview CSP / security headers / cache policy；`npm run webdev:preview:smoke` 可复核 preview Worker / Pages / D1 / R2 / KV 基础资源；`npm run webdev:preview:core-smoke` 通过临时 smoke account/session 走 preview Worker API 验证 Account / Structure / Task / Calendar / Settings / Sync bootstrap / Sync changes / Migration import / idempotent retry / conflict / resolution，并清理测试数据；`npm run webdev:preview:ui-smoke` 使用临时 smoke session 打开 stable Pages preview，验证 Dashboard / Tasks / Calendar / Settings UI 能读取 preview Cloud 数据；`npm run webdev:preview:data-hygiene-smoke` 验证 preview smoke 后 D1 / KV / local temp files 无残留。 |
| Phase 10 | prod release readiness | Readiness static gate ready; Gate R only | `docs/WEBDEV_PROD_READINESS_CHECKLIST.md` 和 `docs/WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md` 已定义 prod readiness 输入、资源规划、数据/安全/回滚/观察/备份核查；`npm run webdev:observability:readiness` 和 `npm run webdev:prod:readiness` 提供只读静态门禁，确认 prod 命名模板、placeholder resource id、replay kill switch、secret hygiene、observability/backup 证据和 Gate R 边界；`npm run webdev:prod:package` 可输出 Gate R 审批包草稿并汇总 ignored 本地 status-only evidence summary，但不创建 prod 资源、不部署、不发布；prod deployment、release、tag、GitHub Release 仍需 Gate R。 |

## 本地完成校验

每个 WebDev 实现包默认执行：

```powershell
npm run webdev:verify
npm run webdev:preview:preflight
npm run webdev:gate-b:readiness
npm run webdev:gate-c:readiness
npm run webdev:ui:walkthrough
npm run webdev:extension:readiness
npm run webdev:desktop:readiness
npm run webdev:desktop:smoke
npm run webdev:acceptance:local
npm run webdev:observability:readiness
npm run webdev:prod:readiness
npm run webdev:prod:package
npm run webdev:prod:evidence
npm run webdev:prod:evidence:check
npm run webdev:completion:audit
npm test
git diff --check
```

`npm run webdev:verify` 必须保持只使用本地或占位资源，不创建 Cloudflare 资源、不部署、不写 prod。
`npm run webdev:preview:preflight` 是 Gate A 前的只读预检：核对 `dev / preview / prod` 命名、占位 resource id、replay kill switch、env example、preview/prod 文档和敏感信息边界；它不创建 Cloudflare 资源、不部署、不执行真实 SSO。
`npm run webdev:gate-b:readiness` 是只读静态门禁：检查 Task-only pending、默认 disabled replay、dry-run/readiness/simulation、test-only replay dev-only guard、non-Task offline write block 和 Gate B 审批边界；它不启用用户可见 replay 写 Cloud、不部署、不发布。
`npm run webdev:gate-c:readiness` 是只读静态门禁：检查 Calendar / Container / Settings 离线写入仍被阻断、Worker replay 仍拒绝非 Task mutation、Settings 仍只展示 Task pending queue，以及 Gate C 审批边界；它不实现非 Task replay、不部署、不发布。
`npm run webdev:ui:walkthrough` 会启动本地 Worker、Pages dev server 和无头浏览器，只使用本地 D1 / 占位 session，不创建真实 Cloudflare 资源；walkthrough 会覆盖 Dashboard / Tasks / Calendar / Settings，并在 Web App bootstrap 后由本地 Worker 创建一条 Cloud Task，再通过 Settings 的 `/sync/changes` cursor 刷新把它拉入 Tasks UI。
`npm run webdev:extension:readiness` 是只读静态门禁：检查 Browser Extension 仍是 Gate D 后续生态组件，`docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md` 已记录审批边界，当前 Extension 未接入 WebDev replay / Cloudflare endpoint，且未新增 Extension deploy / CWS / release 脚本。
`npm run webdev:desktop:readiness` 是只读静态门禁：检查 Electron WebDev runtime mode、路由 guard、preload native bridge、`docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md` 和 Gate E 边界；它不启动 Electron、不生成安装包、不签名、不公证、不分发。
`npm run webdev:desktop:smoke` 会启动本地 Worker / Pages dev server，再以 `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` 和 `TIMEWHERE_ELECTRON_SMOKE=1` 启动 Electron；它只验证本地 Runtime 能加载 Web App，不生成安装包、不签名、不分发。
`npm run webdev:acceptance:local` 串联 `webdev:verify`、`webdev:ui:walkthrough`、`webdev:extension:readiness`、`webdev:desktop:readiness` 和 `webdev:desktop:smoke`，作为不触发 Gate A/D/E/R 的本地 acceptance 入口。
`npm run webdev:observability:readiness` 是只读静态门禁：检查 Worker error envelope、migration/sync conflict privacy guards、D1/R2/KV prod placeholder、observability/backup runbook 和 Gate R 边界；它不调用 Wrangler、不导出 D1、不读取 R2、不部署、不发布。
`npm run webdev:prod:readiness` 只做静态 readiness gate：检查 prod 配置仍是占位、Gate R 未批准、replay 写开关仍关闭、env example 不含 secret；它不创建 Cloudflare prod 资源、不部署、不发布。
`npm run webdev:prod:package` 只输出 Gate R 审批包草稿：当前分支、commit、Gate 状态、必跑命令可用性、ignored 本地 status-only evidence summary 新鲜度、已知限制和回滚摘要；它只读取 `.wrangler/webdev-gate-r-evidence-summary.json` 的状态摘要，不读取真实 Cloudflare resource state、不调用 Wrangler、不创建 prod 资源、不部署、不发布。审批包中的命令 `[x]` 只表示脚本入口存在，不表示该命令已针对当前 commit 重新执行；Fresh Local Evidence Summary 才表示当前 clean pushed HEAD 是否已有通过的 status-only 证据。
`npm run webdev:prod:evidence` 默认只输出 Gate R 证据命令计划；`npm run webdev:prod:evidence -- --run` 才会执行命令，并只在 ignored `.wrangler/` 中保存状态摘要，不保存原始输出、不创建 prod 资源、不部署、不发布。
`npm run webdev:prod:evidence:check` 只读取 ignored `.wrangler/webdev-gate-r-evidence-summary.json`，验证它对应当前 clean 且已推送的 `WebDev` HEAD、命令顺序完整、所有退出码为 0、changed-files scan 为 0、且没有原始输出字段；它不调用 Wrangler、不创建 prod 资源、不部署、不发布。
`npm run webdev:completion:audit` 只做当前 WebDev 目标完成度审计：核对 Phase 0-10、Gate B/C/D/E/R、核心目标证据、脚本入口、分支状态、`HEAD == origin/WebDev` 和敏感信息边界；它输出 `readiness_complete_pending_approval_gates`，表示 readiness 证据完整且当前 commit 已同步远端，但仍有审批 gate，不能替代 Product Owner 批准。

真实 preview / prod 验收入口：

- Phase 9 preview：`docs/WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md`。
- Gate B Task replay：`docs/WEBDEV_TASK_REPLAY_GATE_B_READINESS.md`。
- Gate C non-Task replay：`docs/WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md`。
- Gate D Browser Extension：`docs/WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md`。
- Gate E Desktop Runtime：`docs/WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md`。
- Phase 10 prod readiness：`docs/WEBDEV_PROD_READINESS_CHECKLIST.md`。

Gate A 批准后，可执行真实 `dev / preview` 资源准备命令：

```powershell
npm run webdev:cloudflare:provision
npm run webdev:preview:deploy
npm run webdev:preview:headers-smoke
npm run webdev:preview:smoke
npm run webdev:preview:core-smoke
npm run webdev:preview:ui-smoke
npm run webdev:preview:data-hygiene-smoke
npm run webdev:preview:acceptance
```

这些命令只允许操作 `dev / preview`。Cloudflare auth token、Google Web OAuth public client id、真实 Cloudflare resource id 均不得写入仓库；脚本生成的 resource state、deploy config 和 smoke 临时文件位于 ignored 的 `.wrangler/` 目录。`webdev:preview:headers-smoke` 只读取 stable Pages preview 响应头，验证 CSP、基础安全头、根 HTML no-store 和 hashed asset immutable cache，不需要 Cloudflare auth。`webdev:preview:smoke` 会写入并清理 preview R2 临时对象与 preview KV 临时 key，不触碰 prod。`webdev:preview:core-smoke` 会创建无真实邮箱的临时 smoke account/session，调用 preview Worker API 验证核心 CRUD / sync 读路径和 migration import / idempotent retry / conflict / resolution，随后清理该 smoke account 下的数据与临时迁移 snapshot；它不读取浏览器 session，不打印 token / account email / Cloudflare id。`webdev:preview:ui-smoke` 会创建无真实邮箱的临时 smoke account/session，打开 stable Pages preview 验证 Dashboard / Tasks / Calendar / Settings UI 与 preview Worker 数据路径，随后清理 smoke account。`webdev:preview:data-hygiene-smoke` 验证 preview D1 / KV / local temp file 没有 smoke 残留。`webdev:preview:acceptance` 串联 preview headers、foundation、core API、UI smoke、data hygiene smoke，不新增权限或发布动作。

## Gate 边界

| Gate | 需要批准的动作 |
|---|---|
| A | 创建或绑定真实 Cloudflare dev / preview 资源、填写私有 resource id、配置真实环境变量。 |
| B | 启用用户可见 Task replay 写 Cloud。 |
| C | 实现 Calendar / Container / Settings replay。 |
| D | 定义并实现 Browser Extension 第一阶段范围或 replay。 |
| E | Desktop Runtime 内部包、签名、公证、自动更新或分发策略。 |
| R | prod deployment、public release、GitHub Release、tag、merge、CWS、正式发布。 |

简称 `A` 到 `R` 在执行记录中应写作 `Gate A`、`Gate B`、`Gate C`、`Gate D`、`Gate E`、`Gate R`，避免和普通阶段编号混淆。

## Remaining Approval Gate Register

本登记表只记录剩余审批状态，不构成批准。任何 Gate 从 `Not approved` 变为 `Approved`，都必须有单独 Product Owner 决策（separate Product Owner decision）和对应 scoped implementation plan。

| Gate | 范围 | 当前审批状态 | 当前允许动作 |
|---|---|---|---|
| Gate B | Task replay 写 Cloud | Not approved | 仅保留 readiness / dry-run / simulation；用户可见 replay 写 Cloud 仍关闭，Task delete 继续保持用户侧阻断。 |
| Gate C | Calendar / Container / Settings replay | Not approved | 仅保留 Gate C readiness packet；不实现、不开启、不中转非 Task replay。 |
| Gate D | Browser Extension 第一阶段范围、Cloud/WebDev replay、CWS 路线 | Not approved | Browser Extension 仍是生态组件规划；不实现 Extension replay、不部署、不提交 CWS。 |
| Gate E | Desktop Runtime 内部包、签名、公证、自动更新、分发 | Not approved | 仅允许本地 Runtime readiness / smoke；不打包、不签名、不公证、不分发。 |
| Gate R | prod Cloudflare resources、prod deploy、tag、merge、GitHub Release、public release、CWS、正式发布 | Not approved | 仅允许 prod readiness / package / evidence 静态或只读证据；不创建 prod 资源、不部署、不发布。 |

当前整体分类保持 `readiness_complete_pending_approval_gates`。prod release、Calendar / Container / Settings replay、Browser Extension replay、local-over-cloud overwrite、batch conflict handling、full-entity offline-first 仍需单独批准。

## 当前明确未批准

- prod release；
- Calendar / Container / Settings replay implementation；
- Browser Extension replay；
- local-over-cloud overwrite；
- batch conflict handling；
- full-entity offline-first；
- Google Drive Sync / Google Tasks / Google Calendar 作为新架构数据同步方案。

## 隐私与安全要求

仓库文件、测试输出和文档不得记录：

- token；
- cookie；
- OAuth secret；
- 真实账号邮箱；
- Cloudflare API token；
- Cloudflare 真实 resource id；
- 本地私密路径。
