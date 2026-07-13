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
| Google SSO account session | Preview backed | Worker `/auth/google`、`/auth/session/refresh`、`/account/me`、`/account/profile`、`/account/status`；Pages account panel、workspace profile、runtime/gate status；Gate A stable preview Google SSO smoke 已通过。 | Prod OAuth / origin review 仍归 Gate R。 |
| Tasks CRUD | Implemented local | Worker `/tasks`；Pages Tasks list、create、detail、complete、reopen、delete。 | 人工 UX parity review。 |
| Task detail local execution fields | Implemented local | title、notes、dates、time、duration、priority、plan、bucket、labels、checklist、recurrence first version。 | 与旧 Planner/Focus 逐项视觉验收。 |
| ManageBac continuity | Implemented local continuity | Migration adapter preserves source fields；Worker replay protects source facts。 | ManageBac import connector 本身不迁入 WebDev；后续单独设计。 |
| Calendar Events CRUD | Implemented local | Worker `/calendar/events`；Pages Calendar event create/list/edit/delete, payload-based recurrence first version, and date projection。 | import source policy 与后续 recurrence schema 正式化。 |
| Calendar date projection | Implemented local | `computeCalendarDateProjection()` + Web App projection panel。 | 与旧 Calendar 复杂场景人工验收。 |
| Plans / Buckets / Labels / Containers | Implemented local | Worker `/plans`、`/buckets`、`/labels`、`/containers`；Pages Settings structure panel supports create/list/edit/delete, Plan/Bucket sort order, and Container enable/disable。 | 复杂 reorder drag/drop 与完整视觉 parity。 |
| Settings | Implemented local | Worker `/settings`；Pages preferences panel covers default task preferences, notifications, appearance, week start and Arrange preferences while excluding sync runtime/account state；structure panel covers Plan/Bucket/Label/Container editing。 | 与旧 Settings 逐项视觉验收；MatrixView / ManageBac connector settings remain dedicated connector design。 |
| Daily Settle projection | Implemented local | `computeDashboardProjection()` read-only Dashboard projection。 | 不写 derived state；如需自动安排写入需单独批准。 |
| Reminder state UI | Implemented local | `computeReminderState()` / `advanceReminderSession()` and Dashboard panel。 | 系统通知由 Desktop Runtime phase 接管。 |
| Automatic migration | Preview backed | Legacy snapshot adapter；Worker `/migration/runs`；R2 raw snapshot；D1 import；conflict review；Gate A preview core smoke 已覆盖 migration import、idempotent retry、conflict generation and resolution。 | Prod migration rollout 仍归 Gate R。 |
| Migration conflict review | Implemented local | Settings conflict review supports open conflicts and use_cloud/use_local/skip. | 批量冲突和完整 UX polish。 |
| Sync change feed | Preview backed | D1 `sync_changes`、Worker `/sync/changes`、Pages Settings `Refresh changes`、`npm run webdev:ui:walkthrough` creates a post-bootstrap Cloud Task and verifies it reaches Tasks UI through cursor refresh；Gate A preview core / UI smoke 已覆盖 bootstrap and cursor change refresh。 | Replay write Cloud 仍归 Gate B。 |
| Task-only pending queue | Implemented guarded | Pages Task create/update/complete/reopen can queue; Settings pending panel. | User-facing replay write Cloud remains Gate B。 |
| Sync conflict review | Implemented guarded | Single Task `keep_cloud` / `discard_local` / `later` only。 | batch conflict, local-over-cloud and non-Task conflicts remain separate approvals。 |
| Desktop Runtime | Opt-in scaffolded | Electron supports `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` / `TIMEWHERE_WEB_APP_URL`, loads the Web App by hash view, keeps native bridge in preload, guards non-Web-App navigation, and has local `npm run webdev:desktop:smoke` evidence. | Gate E required before internal package, signing, notarization, auto-update, or distribution. |
| Browser Extension ecosystem | Deferred | Direction only。 | Gate D required before defining first phase。 |

## 明确不以本清单视为完成的事项

- prod deployment；
- prod Cloudflare 资源创建；
- Task replay 写 Cloud；
- Calendar / Container / Settings replay；
- Browser Extension replay；
- local-over-cloud overwrite；
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
