# WebDev 业务完整性验收清单

**状态**: Active parity checklist
**依据**: D-046, D-047, D-049, `docs/WEBDEV_COMPLETION_CHECKLIST.md`

本文用于判断 Web App 是否已经完整承接 TimeWhere 现有核心业务。它不是新功能批准，不启用生产部署，不批准离线 replay 扩围。

## 验收原则

- Web App 是唯一业务实现入口。
- Worker / D1 是 canonical data path。
- IndexedDB 只作为 legacy migration source、read cache 或 pending queue。
- Desktop Runtime 和 Browser Extension 不应新增业务分叉。
- Google 只作为 SSO / OIDC；不把 Google Drive Sync、Google Tasks 或 Google Calendar 纳入本清单。

## 核心业务覆盖

| Capability | WebDev status | Evidence | Remaining work |
|---|---|---|---|
| Google SSO account session | Internal prod verified | Worker auth/session/account endpoints；D-050 独立 SSO 项目；preview/prod Pages origin；两套环境真实测试账户登录与自动 smoke 均通过。 | 当前 Google Auth Platform 保持 Testing，仅限测试用户；扩大受众或公开发布需单独批准。 |
| Tasks CRUD | Internal prod UI verified | Worker `/tasks`；WebDev 直接挂载旧 `tasks.html` / `styles.css`，通过 `LegacyDataBridge` 支持 Plan/Task 创建、Board/List/Calendar、搜索、筛选、分组、详情、完成/重开/删除；本地 walkthrough 与 preview/prod UI smoke 通过。 | Cloud v1 暂无稳定 reorder API，旧移动/排序控件保留并明确 disabled。 |
| Task detail local execution fields | Internal prod UI verified | 旧详情面板结构直接复用，title、notes、dates、time、duration、priority、plan、bucket、labels、checklist、recurrence 均映射到 Repository；walkthrough 已验证 checklist/priority 持久化。 | ManageBac 来源事实继续只读；Connector 导入不在本轮范围。 |
| ManageBac continuity | Implemented local continuity | Migration adapter preserves source fields；Worker replay protects source facts。 | ManageBac import connector 本身不迁入 WebDev；后续单独设计。 |
| Calendar Events CRUD | Internal prod UI verified | Worker `/calendar/events`；WebDev 直接挂载旧 `calendar.html` / `styles.css`，周/月视图、搜索、前后导航、旧事件 modal 的创建/编辑/删除映射到 Repository；walkthrough 与 preview/prod UI smoke 通过。 | ICS/import source policy 与 recurrence schema 正式化仍需后续设计。 |
| Calendar date projection | Internal prod UI verified | `computeCalendarDateProjection()` 填充旧 week/month DOM；preview/prod UI smoke 已验证 Cloud event 可见。 | 旧页面无数据脚本空态与 Cloud 测试数据态不能做逐像素内容 diff，DOM/CSS 基线以原文件直接复用保证。 |
| Plans / Buckets / Labels / Containers | Internal prod UI verified | Worker `/plans`、`/buckets`、`/labels`、`/containers`；旧 Tasks/Settings 控件通过 Repository 支持 create/list/edit/delete、Plan/Bucket sort order、Container enable/disable；walkthrough 验证 Plan 与 Container 创建持久化。 | 复杂 reorder drag/drop 尚无 Cloud API，原控件保留并明确 disabled。 |
| Settings | Internal prod UI verified | WebDev 直接挂载旧 `settings.html` / `styles.css`；通用、日历、Plan、任务默认值、Google SSO/Cloud、迁移和同步诊断均嵌入旧单列 section/group/row；walkthrough 与 preview/prod UI smoke 通过。 | MatrixView / ManageBac / 旧 Drive Sync 等旧 runtime 专属控件可见但明确 disabled，后续能力需单独决策。 |
| Daily Settle projection | Internal prod UI verified | `computeDashboardProjection()` 只读填充旧 `focus.html` / `styles.css` 四栏结构；本地与 preview/prod UI smoke 通过。 | 不写 derived state；如需自动安排写入需单独批准。 |
| Reminder state UI | Implemented local | `computeReminderState()` / `advanceReminderSession()` and Dashboard panel。 | 系统通知由 Desktop Runtime phase 接管。 |
| Automatic migration | Internal prod smoke backed | Legacy snapshot adapter；Worker migration API；R2 raw snapshot；D1 import；conflict review；preview/prod core smoke 已覆盖 migration import、幂等重试、冲突生成与解决。 | 真实 legacy 用户数据迁移、备份核验与回滚演练仍需单独 rollout 验收。 |
| Migration conflict review | Implemented local | Settings conflict review supports open conflicts and use_cloud/use_local/skip. | 批量冲突和完整 UX polish。 |
| Sync change feed | Preview backed | D1 `sync_changes`、Worker `/sync/changes`、Pages Settings `Refresh changes`、`npm run webdev:ui:walkthrough` creates a post-bootstrap Cloud Task and verifies it reaches Tasks UI through cursor refresh；Gate A preview core / UI smoke 已覆盖 bootstrap and cursor change refresh。 | Replay write Cloud 仍归 Gate B。 |
| Task-only pending queue | Implemented guarded | Pages Task create/update/complete/reopen can queue; Settings pending panel. | User-facing replay write Cloud remains Gate B。 |
| Sync conflict review | Implemented guarded | Single Task `keep_cloud` / `discard_local` / `later` only。 | batch conflict, general local-over-cloud outside D-052 and non-Task conflicts remain separate approvals。 |
| Desktop Runtime | Opt-in scaffolded | Electron supports `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` / `TIMEWHERE_WEB_APP_URL`, loads the Web App by hash view, keeps native bridge in preload, guards non-Web-App navigation, and has local `npm run webdev:desktop:smoke` evidence. | Gate E required before internal package, signing, notarization, auto-update, or distribution. |
| Browser Extension ecosystem | Deferred | Direction only。 | Gate D required before defining first phase。 |

## 明确不以本清单视为完成的事项

- prod 面向真实用户的 rollout / public release；
- Task replay 写 Cloud；
- Calendar / Container / Settings replay；
- Browser Extension replay；
- general local-over-cloud overwrite outside the D-052 manual JSON restore flow；
- batch conflict handling；
- full-entity offline-first；
- Desktop packaging / signing / auto-update；
- Google Drive Sync / Google Tasks / Google Calendar connector。

## Phase 5 完成定义

Phase 5 升级为 `Complete for local preview` 前必须同时满足：

- 本清单所有非 gate、非 deferred capability 至少达到 `Implemented local` 或更高证据等级（例如 `Preview backed`）；
- `npm run webdev:verify`、`npm run webdev:ui:walkthrough` 和 `npm test` 通过；
- 至少一次可重复 Web App walkthrough 通过 Dashboard、Tasks、Calendar、Settings、Migration、Reminder、Task detail；
- walkthrough evidence 不包含真实账号邮箱、token、cookie、OAuth secret、Cloudflare secret 或本地私密路径；
- `docs/WEBDEV_COMPLETION_CHECKLIST.md` 同步更新 Phase 5 状态。
