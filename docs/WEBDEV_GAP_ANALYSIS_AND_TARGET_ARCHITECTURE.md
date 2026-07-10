# WebDev Gap Analysis And Target Architecture

**状态**: Draft for Product Owner review
**日期**: 2026-07-10
**依据**: D-046, `docs/ARCHITECTURE_DIRECTION_PROPOSAL_CLOUD_WEB_FIRST.md`, `docs/handoffs/outbox/HANDOFF-WEBDEV-MIGRATION-2026-07-10.md`

> 本文是 WebDev 架构设计阶段产物，不是实施迁移计划。它用于把 D-046 的 Cloud-first / Web-first 方向拆成技术差距、目标架构、迁移路线、风险和待决策事项，供 Product Owner 评审。

## 1. Executive Summary

TimeWhere 当前实现仍以 Chrome Extension / Electron shell / IndexedDB / Google Drive `appDataFolder` sync 为主。这个架构已经支撑了 MVP、桌面内部包和跨端同步验证，但与 D-046 的目标方向存在结构性差距：

- 当前业务逻辑分散在 Extension 页面、Popup/Side Panel、Desktop renderer 和共享脚本中；目标是 Web Application 成为唯一业务实现。
- 当前 IndexedDB 是运行时事实数据源；目标是 Cloud Database 成为 canonical data source，IndexedDB 降级为缓存和离线队列。
- 当前 Desktop 与 Browser Extension 都包含较多产品行为；目标是 Desktop 只保留 native runtime，Browser Extension 只做浏览器生态增强。
- 当前 Google Drive Sync 是客户端之间的数据交换机制；目标方向暂不设计 Google Sync，账户身份先采用 Google SSO / OIDC。

推荐下一阶段先做架构拆解与接口设计，不立即迁移数据或改业务代码。

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

| Phase | Goal | Output |
|---|---|---|
| 0. Direction baseline | Record D-046 and stop treating Extension/Desktop as product center. | Current proposal, this analysis, PO-approved decision list. |
| 1. Interface design | Define Repository, Platform, Auth, and API contracts without moving code. | Architecture spec, API draft, data authority matrix. |
| 2. Domain extraction plan | Identify business logic that can move from page scripts into Web domain/services. | Module map, dependency map, extraction sequence. |
| 3. Web App shell plan | Decide Web framework/build/runtime and route structure. | Web app technical spec and migration entry plan. |
| 4. Cloud data model plan | Define canonical entities, ownership, audit fields, migration/import strategy. | Cloud schema proposal and migration risk review. |
| 5. Runtime adaptation | Plan Desktop Runtime and Browser Extension as adapters around Web App. | Runtime bridge contract and extension capability reduction plan. |
| 6. Data migration execution | Only after PO approval, migrate selected data from IndexedDB/local sync into Cloud. | Migration tool, rollback plan, verification evidence. |
| 7. Release model transition | Separate Runtime release from Web App deployment. | Release runbooks and environment strategy. |

Phase 1-5 are design/planning phases. Phase 6 and later require separate Product Owner implementation approval.

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

## 8. Product Owner Decisions Needed

1. Cloud stack direction: managed backend platform, custom backend, or staged prototype service.
2. Offline posture: full offline-first, offline cache with queue, or online-first with limited cache.
3. Web framework and hosting preference.
4. Whether Desktop continues as Electron Runtime for v1 target architecture.
5. Browser Extension v1 ecosystem scope: quick capture only, quick capture + glance, or additional browser context features.
6. Migration policy: automatic migration, user-confirmed import, or fresh Cloud workspace with manual import.
7. Release model: internal WebDev preview environment before public or private deployment.

## 9. Immediate Next Work

Before implementation, Codex should prepare:

- `WEBDEV_INTERFACE_CONTRACTS.md`: Repository, Platform, Auth, and API contract draft.
- `WEBDEV_DATA_AUTHORITY_MATRIX.md`: entity-by-entity authority and migration policy.
- `WEBDEV_MIGRATION_RISK_REGISTER.md`: detailed risk owner, mitigation, and acceptance evidence.

These documents should remain design artifacts until Product Owner approves an implementation package.
