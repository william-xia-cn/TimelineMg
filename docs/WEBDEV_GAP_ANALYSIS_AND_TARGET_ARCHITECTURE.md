# WebDev Gap Analysis And Target Architecture

**状态**: Active architecture baseline with implementation status; not release approval
**日期**: 2026-07-13
**依据**: D-046, `docs/ARCHITECTURE_DIRECTION_PROPOSAL_CLOUD_WEB_FIRST.md`, `docs/handoffs/outbox/HANDOFF-WEBDEV-MIGRATION-2026-07-10.md`

> 本文最初是 WebDev 架构设计阶段产物；当前同时作为 WebDev 目标架构与实现状态基线。它记录 D-046 / D-047 方向、已执行的 D-048 / D-049 / Gate A preview evidence，以及仍需单独审批的 Gate B/C/D/E/R。它不是 prod deployment、release、replay 写入、Desktop 分发或 Browser Extension 新阶段批准。

## 1. Executive Summary

TimeWhere 当前实现仍以 Chrome Extension / Electron shell / IndexedDB / Google Drive `appDataFolder` sync 为主。这个架构已经支撑了 MVP、桌面内部包和跨端同步验证，但与 D-046 的目标方向存在结构性差距：

- 当前业务逻辑分散在 Extension 页面、Popup/Side Panel、Desktop renderer 和共享脚本中；目标是 Web Application 成为唯一业务实现。
- 当前 IndexedDB 是运行时事实数据源；目标是 Cloud Database 成为 canonical data source，IndexedDB 降级为缓存和离线队列。
- 当前 Desktop 与 Browser Extension 都包含较多产品行为；目标是 Desktop 只保留 native runtime，Browser Extension 只做浏览器生态增强。
- 当前 Google Drive Sync 是客户端之间的数据交换机制；目标方向暂不设计 Google Sync，账户身份先采用 Google SSO / OIDC。

最初建议的架构拆解、接口设计、Cloudflare scaffold、Web App 业务覆盖、自动迁移闭环、preview 验收和 readiness 证据已经进入 `docs/WEBDEV_COMPLETION_CHECKLIST.md` 跟踪。当前状态由 `npm run webdev:completion:audit` 归类为 `readiness_complete_pending_approval_gates`：readiness 证据完整，但剩余 gate 仍必须由 Product Owner 单独批准。

## 1.1 Current Implementation Status

截至当前 WebDev 分支：

- D-048 初始实现包已落地：`workers/` 与 `pages/` 包含 Cloudflare Worker、D1 schema、migration entry、Pages / Vite / React Web App shell、Repository/API clients 和静态/集成测试。
- Gate A 已批准并执行：dev / preview Cloudflare D1/R2/KV plus Pages resources 已创建/确认；真实 resource id 只保存在 ignored `.wrangler/` local state。
- Preview Worker 与 stable Pages preview 已完成 smoke：headers、foundation resource、core API、UI 和 data hygiene smoke 均通过，且不触碰 prod。
- Web App 已覆盖 Dashboard、Tasks、Calendar、Settings、Daily Settle projection、Reminder state、migration conflict review、structure editing 和 Task-only pending diagnostics 的 local preview 能力。
- D-049 Phase 2-9 已完成 readiness / guarded implementation：Task-only pending queue 和单 Task conflict review 可见，replay write Cloud 仍关闭；Calendar / Container / Settings replay 只保留设计边界。
- Phase 10 仅为 readiness：`webdev:prod:readiness`、`webdev:prod:package`、`webdev:observability:readiness` 与 `webdev:completion:audit` 都不创建 prod 资源、不部署、不发布。
- 仍未批准：Gate B Task replay 写 Cloud、Gate C non-Task replay、Gate D Browser Extension 第一阶段、Gate E Desktop Runtime 分发、Gate R prod deployment / release。

## 2. Current Architecture Snapshot

| Area | Current state | Reusable assets |
|---|---|---|
| Product UI | `extension/pages/*` and `extension/popup/*` provide Dashboard, Tasks, Calendar, Settings, Popup, Side Panel. | Existing HTML/CSS/JS behavior, user workflows, acceptance cases. |
| Business logic | Scheduling, Daily Settle, reminders, ManageBac, task/calendar logic live in shared JS and page scripts. | Domain rules and tests can become Web domain/service modules. |
| Storage | Dexie / IndexedDB is primary runtime store. | Schema knowledge, local migration lessons, offline cache candidate. |
| Sync | Google Drive `appDataFolder` sync document plus merge/conflict runtime. | Conflict UX lessons and merge-test cases; not a target cloud data model. |
| Desktop | Electron wraps local pages and provides tray, notification, safeStorage, autostart, OAuth, packaging. | Runtime bridge pattern and native capability inventory. |
| Browser Extension | MV3 shell provides Side Panel, notifications, quick access, background alarms. | Browser entry points and extension capability inventory. |
| Governance | DECISIONS / PROJECT_MASTER / TASK_BOARD capture release and scope boundaries. | Continue as architecture decision authority. |

## 3. Gap Analysis

| Dimension | Current gap | Target direction |
|---|---|---|
| Data authority | IndexedDB is source of truth; Google Drive sync is peer exchange. | Cloud database is canonical; local stores are cache/offline queue. |
| Business ownership | Business logic is mixed with page scripts and shell concerns. | Web App owns all business UI and rules. |
| Platform boundary | Some direct Chrome/Electron calls remain in product surfaces. | Business code calls Platform Interface only. |
| Repository layer | Pages often read/write local DB directly. | Business logic uses Repository interfaces backed by Cloud API + local cache. |
| Auth | Google auth exists for sync/OAuth flows, not a unified product account. | Google SSO / OIDC is the first account identity path. |
| Sync | Drive sync resolves device-to-device state, not server authority. | Cloud API mediates reads/writes; connector sync is separate future work. |
| Desktop | Desktop renderer still hosts local product pages and logic. | Desktop loads/runs Web App and exposes only native bridge capabilities. |
| Extension | Extension can behave as a product surface. | Extension becomes browser enhancement and launcher/quick-capture surface. |
| Release lifecycle | Runtime and business changes often package together. | Web App deploys frequently; Desktop Runtime updates less often. |

## 4. Target Architecture

```text
                       TimeWhere Cloud
        +--------------------+--------------------+
        |                    |                    |
   Cloud API            Cloud Database       Cloud Jobs / AI
        |
        v
                  Web Application
        +--------------------+--------------------+
        |                    |                    |
   Repository Layer     Platform Interface   Domain Services
        |                    |
        v                    v
 Local Cache / Queue   Web / Desktop / Extension adapters
        |
        +--------------------+--------------------+
        |                    |                    |
 Desktop Runtime       Browser Extension     Plain Browser
```

### Cloud

- Owns canonical data, user identity, API, scheduling jobs, AI services, and external connectors.
- Uses Google SSO / OIDC as the first account identity mechanism.
- Does not own UI.
- Does not treat Google Drive Sync, Google Tasks, or Google Calendar as core data architecture in this phase.

### Web Application

- Owns Dashboard, Tasks, Calendar, Settings, Daily Settle, task arrangement, reminders UI, and business rules.
- Calls Repository interfaces for data access.
- Calls Platform Interface for native/browser capability.
- Must be runnable in browser and inside Desktop Runtime.

### Desktop Runtime

- Owns window, tray/menu bar, notification, autostart, secure local storage, native bridge, and packaging.
- Does not own Task/Event/Container/Daily Settle business logic.
- Loads the Web Application and exposes a narrow native bridge.

### Browser Extension

- Owns browser-specific surfaces: quick capture, current task glance, browser reminder context, and open Web/Desktop actions.
- Does not own full product implementation.
- Does not become the source of truth for data.

## 5. Repository And Platform Direction

### Repository Layer

Minimum target interfaces to design before implementation:

- `TaskRepository`
- `CalendarRepository`
- `ContainerRepository`
- `SettingsRepository`
- `SyncStatusRepository` or equivalent runtime status source

Expected backing order:

```text
Web business logic
  -> Repository interface
  -> Cloud API
  -> Local cache / offline queue
```

IndexedDB may remain as a local cache during migration, but business logic should stop depending on Dexie directly.

### Platform Interface

Minimum target capabilities:

- `notification`
- `window`
- `auth`
- `secureStorage`
- `system`
- `externalLink`
- `browserContext`

Desktop and Extension adapters may differ internally, but Web business code must not branch on raw Electron or Chrome APIs.

## 6. Migration Roadmap

| Phase | Goal | Current output / status |
|---|---|---|
| 0. Direction baseline | Record D-046 and stop treating Extension/Desktop as product center. | Complete; D-046/D-047/D-048/D-049 are recorded in `DECISIONS.md`. |
| 1. Interface design | Define Repository, Platform, Auth, and API contracts. | Complete; see `WEBDEV_INTERFACE_CONTRACTS.md`, `WEBDEV_DATA_AUTHORITY_MATRIX.md`, and `WEBDEV_AUTOMATIC_MIGRATION_PLAN.md`. |
| 2. Domain extraction and Web App shell | Move business capability into Web App / Repository-backed modules. | Local preview complete for Dashboard, Tasks, Calendar, Settings, Daily Settle projection, Reminder state, migration conflict review, structure editing, and Task-only pending diagnostics. |
| 3. Cloud canonical schema and API | Define and implement canonical D1 entities, API routes, revisions, change cursor, and error envelope. | Local integration and preview smoke backed; Worker routes and D1 migrations are under `workers/`. |
| 4. Automatic migration execution | Migrate legacy IndexedDB snapshot after Google SSO with idempotency and conflict records. | Local integration and Gate A preview core smoke backed; prod migration rollout remains Gate R. |
| 5. Runtime adaptation | Make Desktop Runtime and Browser Extension adapters around Web App direction. | Desktop WebDev runtime mode and Gate E readiness are scaffolded; Browser Extension Gate D readiness is documented and deferred. |
| 6. Offline / sync v1 hardening | Preserve read cache, block unsafe offline writes, and prepare replay gates. | D-049 Phase 2-9 complete; Task-only pending queue and diagnostics are visible, replay writes remain disabled until Gate B/C. |
| 7. Release model transition | Separate Runtime release from Web App deployment and prepare prod readiness. | Gate R readiness package and observability/backup runbook exist; prod deployment/release remains unapproved. |

This roadmap has moved beyond pure design for the approved D-048 / D-049 / Gate A scopes. It still does not approve the remaining gated actions: replay writes, non-Task replay, Browser Extension phase, Desktop distribution, prod deployment, tag, GitHub Release, CWS, or public release.

## 7. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Data migration loss or duplication | High | Design import preview, backups, rollback, and per-entity verification before any migration. |
| Business rule drift during extraction | High | Preserve current tests and add contract tests for Daily Settle, scheduling, reminders, and task CRUD before moving code. |
| Offline expectation mismatch | High | Decide whether offline is required, degraded, or cache-only before Cloud schema implementation. |
| Google account identity ambiguity | Medium | Treat Google SSO as account identity only; do not conflate it with Google Drive Sync or connector data. |
| Desktop native behavior regression | Medium | Keep Desktop Runtime bridge narrow and test tray/notification/autostart separately from Web business logic. |
| Extension scope creep | Medium | Define allowed Extension capabilities before porting; block full product UI from re-growing there. |
| Release confusion | Medium | Keep D-046 separate from release approval; define Web deploy and Runtime release runbooks before public rollout. |
| Privacy boundary expansion | High | Require privacy review before cloud persistence, AI, usage data, or external connectors. |

## 8. Product Owner Decisions

D-047 resolves the first architecture defaults:

1. Cloud stack: Cloudflare Workers + D1 + R2 + KV + Pages.
2. Offline posture: retain offline read cache where possible; v1 blocks edits to current data while offline, and full offline mutation queue/conflict handling is deferred.
3. Web App scope: full implementation of existing TimeWhere product capabilities, not a reduced MVP subset.
4. Desktop runtime: continue Electron by default for v1; alternate runtime requires separate decision.
5. Browser Extension: first-phase scope deferred.
6. Migration policy: automatic migration after Google SSO, without requiring manual export/import.
7. Google role: Google SSO / OIDC account identity only for this stage.

Still needs future Product Owner review before the next gated implementation or deployment step:

- Gate B: enable user-facing Task replay writes to Cloud.
- Gate C: implement Calendar / Container / Settings replay.
- Gate D: define and implement Browser Extension first phase, including any Extension replay or CWS path.
- Gate E: package, sign, notarize, auto-update, or distribute Desktop Runtime.
- Gate R: create prod Cloudflare resources, deploy prod, tag, publish GitHub Release, submit CWS, or announce release.
- Separate approval remains required for local-over-cloud overwrite, batch conflict handling, full-entity offline-first, and any privacy-sensitive connector expansion.

## 9. Current Artifacts And Remaining Gates

Current design and implementation artifacts:

- `WEBDEV_INTERFACE_CONTRACTS.md`: Repository, Platform, Auth, and API contract draft.
- `WEBDEV_DATA_AUTHORITY_MATRIX.md`: entity-by-entity authority and migration policy.
- `WEBDEV_AUTOMATIC_MIGRATION_PLAN.md`: automatic migration flow, idempotency, failure handling, and acceptance criteria.
- `WEBDEV_BUSINESS_PARITY_CHECKLIST.md`: Web App parity / preview-backed capability status.
- `WEBDEV_COMPLETION_CHECKLIST.md`: Phase 0-10 completion status and gate boundaries.
- `WEBDEV_PREVIEW_ACCEPTANCE_RUNBOOK.md`: Gate A preview evidence and stop conditions.
- `WEBDEV_PROD_READINESS_CHECKLIST.md`: Gate R readiness inputs and release boundaries.
- `WEBDEV_TASK_REPLAY_GATE_B_READINESS.md`: Task replay approval packet.
- `WEBDEV_NON_TASK_REPLAY_GATE_C_READINESS.md`: non-Task replay approval packet.
- `WEBDEV_BROWSER_EXTENSION_GATE_D_READINESS.md`: Browser Extension deferred-scope readiness.
- `WEBDEV_DESKTOP_RUNTIME_GATE_E_READINESS.md`: Desktop Runtime distribution readiness.
- `WEBDEV_OBSERVABILITY_BACKUP_RUNBOOK.md`: observability / backup readiness.

Current first implementation package:

- D-048 initial scaffold is complete under `workers/` and `pages/`.
- D-049 Phase 2-9 is complete within its approved boundary.
- Gate A dev / preview resources and preview smoke are complete; true ids remain only in ignored local state.

No further product-behavior implementation should proceed from this document alone. Continue with readiness/evidence cleanup when useful, or stop for Product Owner approval when work would cross Gate B/C/D/E/R.
