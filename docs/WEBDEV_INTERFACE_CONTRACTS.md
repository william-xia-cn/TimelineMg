# WebDev Interface Contracts

**状态**: Draft for Product Owner review
**日期**: 2026-07-10
**依据**: D-046, D-047, `docs/WEBDEV_GAP_ANALYSIS_AND_TARGET_ARCHITECTURE.md`

> 本文定义 WebDev 目标架构的接口方向。它不是实现任务，不创建 Cloudflare 资源，不修改现有 Extension/Desktop 代码。

## 1. Architecture Defaults

WebDev v1 默认采用：

- Cloud: Cloudflare Workers + D1 + R2 + KV。
- Web App: Cloudflare Pages + Vite + React。
- Account: Google SSO / OIDC first。
- Desktop: 继续 Electron Runtime，保留 window / tray / notification / secure storage / native bridge。
- Extension: 第一阶段暂不设计，后续作为生态组件单独规划。

Cloudflare 结构参考 TimeOnChrome 的工程模式，但 TimeWhere 不复制 TimeOnChrome 的家长管控、`device_token`、managed policy 或受管设备模型。

## 2. Cloudflare Worker API Groups

| Group | Purpose |
|---|---|
| `/auth/*` | Google OIDC 登录、account session refresh、logout。 |
| `/account/*` | 当前账户资料、用户偏好、数据空间信息。 |
| `/tasks/*` | Task 查询、创建、更新、完成、删除、批量变更。 |
| `/calendar/*` | Calendar event 查询、创建、更新、删除、日期投影。 |
| `/containers/*` | Time container 查询、创建、更新、禁用、排序。 |
| `/settings/*` | 用户设置和 runtime-independent product settings。 |
| `/migration/*` | 旧 IndexedDB snapshot 上传、迁移运行状态、冲突诊断。 |
| `/sync/*` | 初始只读 bootstrap snapshot、增量拉取、客户端 cache cursor、在线写入后的状态协调；v1 提供 Cloud-confirmed change feed、disabled mutation replay contract skeleton，以及 sync conflict record scaffold，但不应用离线写入。 |

API 返回应使用统一 envelope：

```ts
type ApiResult<T> = {
  status: 'ok' | 'error';
  data?: T;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  server_time: string;
};
```

错误信息不得包含 token、cookie、OAuth secret、真实账号邮箱或本地私密路径。

## 3. Auth Contract

目标登录链路：

```text
Google OIDC authorization
  -> Web App obtains Google identity assertion
  -> Worker verifies Google identity
  -> Worker creates TimeWhere account session
  -> Web App stores short-lived session state through approved platform storage
```

已落地的 v1 入口：

| Endpoint | Purpose |
|---|---|
| `POST /auth/google` | Web App 提交 Google ID token，Worker 校验 audience 后创建 TimeWhere account session。 |
| `POST /auth/session/refresh` | 使用仍有效的 TimeWhere bearer 轮换新的 account session，并撤销旧 session；不接触 Google token。 |
| `DELETE /auth/session` | 注销当前 TimeWhere Cloud session，只影响本产品 session，不撤销 Google 账户授权。 |
| `GET /account/me` | 返回当前 Cloud account 与 TimeWhere workspace/profile。 |
| `GET /account/profile` | 读取当前 TimeWhere workspace/profile，不返回 Google token。 |
| `PATCH /account/profile` | 更新当前 TimeWhere workspace/profile 名称；不修改 Google account metadata。 |
| `GET /account/status` | 返回当前 account/profile 与脱敏 runtime/gate 状态，用于 Web App、Desktop Runtime 和 preview 验收。 |

原则：

- Google 是身份提供方，不是业务数据源。
- Worker account session 与旧 Google Drive Sync refresh token 分离。
- Web App 不直接持有 Cloudflare resource credentials。
- Desktop secure storage 可保存 runtime session refresh material；plain browser 使用 Web 安全存储策略另行设计。

## 3.1 Sync Bootstrap Contract

已落地的 v1 只读入口：

| Endpoint | Purpose |
|---|---|
| `GET /sync/bootstrap` | 返回当前账户的 canonical Task / Calendar / Plan / Bucket / Label / Container / Settings snapshot、account/profile 和最新 change cursor，用于 Web App、Desktop Runtime 或未来 cache 初始化。 |
| `GET /sync/changes?cursor=<n>` | 返回 cursor 之后的 Cloud-confirmed change feed；Web App 只用它增量刷新本地 read cache，不 replay 本地 mutation。 |

边界：

- 只读；不应用离线 mutation。
- 返回 `offline_write_policy: "blocked_v1"`。
- 不返回 Google token、Cloudflare resource id、OAuth secret、cookie 或本地路径。
- Web App 可保存最新 cursor，并通过 `/sync/changes` 拉取后续变化；该路径仍然只更新 read cache，不把本地 pending 写回 Cloud。

## 4. Repository Contracts

业务层只访问 Repository，不直接访问 D1、Worker fetch、Dexie 或 Chrome/Electron API。

```ts
interface TaskRepository {
  listTasks(query: TaskQuery): Promise<TaskPage>;
  getTask(id: string): Promise<Task>;
  createTask(input: TaskCreateInput): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  completeTask(id: string, input: CompleteTaskInput): Promise<Task>;
  deleteTask(id: string): Promise<void>;
}

interface CalendarRepository {
  listEvents(query: CalendarQuery): Promise<CalendarEventPage>;
  getDateProjection(dateRange: DateRange): Promise<DateProjection>;
  createEvent(input: CalendarEventInput): Promise<CalendarEvent>;
  updateEvent(id: string, patch: CalendarEventPatch): Promise<CalendarEvent>;
  deleteEvent(id: string): Promise<void>;
}

interface ContainerRepository {
  listContainers(query?: ContainerQuery): Promise<Container[]>;
  createContainer(input: ContainerInput): Promise<Container>;
  updateContainer(id: string, patch: ContainerPatch): Promise<Container>;
  disableContainer(id: string): Promise<Container>;
}

interface SettingsRepository {
  getSettings(): Promise<ProductSettings>;
  updateSettings(patch: ProductSettingsPatch): Promise<ProductSettings>;
}

interface MigrationRepository {
  detectLocalMigrationState(): Promise<LocalMigrationState>;
  createMigrationRun(snapshot: LocalSnapshot): Promise<MigrationRun>;
  getMigrationRun(id: string): Promise<MigrationRun>;
}
```

Exact entity fields remain a separate data-model design task; this document defines boundaries, not final schema.

## 5. Platform Contracts

Web business code calls a platform adapter for runtime capabilities:

```ts
interface TimeWherePlatform {
  notification: {
    notify(payload: NotificationPayload): Promise<PlatformResult>;
    onClick(callback: NotificationClickHandler): Unsubscribe;
  };
  window: {
    open(route: string): Promise<PlatformResult>;
    focus(route?: string): Promise<PlatformResult>;
  };
  secureStorage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<PlatformResult>;
    remove(key: string): Promise<PlatformResult>;
  };
  system: {
    getRuntimeInfo(): Promise<RuntimeInfo>;
    getDesktopRuntimeInfo?(): Promise<DesktopRuntimeInfo>;
  };
  externalLink: {
    open(url: string): Promise<PlatformResult>;
  };
}
```

Desktop adapter maps these to Electron. Browser adapter maps them to Web APIs where available. Extension adapter is deferred.
Electron WebDev runtime mode is opt-in via `TIMEWHERE_DESKTOP_RUNTIME_MODE=webdev` or `TIMEWHERE_WEB_APP_URL`; it reports `mode: "webdev"` and `business_logic_owner: "web_app"` through desktop runtime diagnostics while keeping the legacy extension shell as the default until Gate E packaging/distribution is approved.

## 6. Offline V1 Contract

WebDev v1 preserves offline reading where possible. After D-049 it also allows a narrow Task-only queued pending path for create/update/complete/reopen, while blocking Task delete and all non-Task offline writes.

Offline behavior:

```text
Network unavailable
  -> Repository serves last local cache if available
  -> Task create/update/complete/reopen may enter a local pending queue when a TimeWhere session exists
  -> Task delete plus Calendar / Container / Settings writes return offline_write_blocked
  -> UI explains pending state and blocks direct Cloud edit/delete until pending state is handled
  -> When online, Repository refreshes from Cloud and can run retry preview diagnostics without replay writes
```

Rules:

- no full-entity offline-first in v1;
- no Calendar / Container / Settings replay in v1;
- no user-visible Cloud replay writes before Gate B approval;
- no hidden conflict creation from offline edits;
- local cache can support reading and migration safety;
- Task-only pending remains local until a later Product Owner-approved replay gate.

The follow-up design direction is recorded in `docs/WEBDEV_OFFLINE_MUTATION_CONFLICT_DESIGN.md`. That document does not activate offline writes; it defines the future queue, replay, revision, and conflict model needed before Product Owner can approve implementation.

Current scaffold status:

- `/sync/bootstrap` initializes Web App read caches with a canonical snapshot and latest cursor.
- `/sync/changes` is available for Cloud-confirmed change cursors; Pages can apply those changes to Task / Calendar / Structure / Settings read caches without replaying local mutations.
- Task cache application preserves local pending rows, so a Cloud change for the same Task id does not overwrite a pending local Task before replay/discard.
- `/sync/mutations` validates mutation replay requests, reports the Task-only activation gate, field-level conflict preview, and internal disabled transaction skeleton, persists metadata-only outcomes, but returns `disabled_v1`.
- `GET /sync/mutations` and `GET /sync/mutations/:id` expose replay outcome diagnostics without storing raw mutation payloads.
- Pages Settings can read these sanitized replay outcomes and inspect Task replay gates for developer diagnostics.
- `POST /sync/mutations/dry-run` is an internal disabled dry-run endpoint that joins replay gates with existing outcomes/conflicts, previews sanitized apply plans and conflict record shape, and writes no data.
- `POST /sync/mutations/readiness-summary` is an internal disabled summary endpoint that aggregates dry-run candidate counts, blocked reasons, apply-plan previews, and conflict-preview counts for developer review before any replay enablement.
- `POST /sync/mutations/enablement-simulation` is an internal disabled simulation endpoint that evaluates Gate A-E readiness inputs without enabling replay writes.
- `/sync/conflicts` can list and read future sync conflict records.
- Pages Settings can read these sanitized sync conflict records for developer diagnostics.
- No sync conflict resolution UI or offline write replay is enabled in v1.

## 7. Cloudflare Environment And Resource Strategy

Cloudflare strategy follows the TimeOnChrome-style structure, adapted to TimeWhere:

- keep future Cloud code in the current repository under `workers/` and `pages/`;
- separate `dev`, `preview`, and `prod` environments;
- keep stable Worker binding names across environments;
- never commit Cloudflare resource ids, API tokens, Google secrets, or environment secrets.

Recommended resource naming:

| Environment | Worker | Pages | D1 | R2 | KV |
|---|---|---|---|---|---|
| dev | `timewhere-dev-api` | `timewhere-dev-web` | `timewhere-dev-db` | `timewhere-dev-snapshots` | `timewhere-dev-cache` |
| preview | `timewhere-preview-api` | `timewhere-preview-web` | `timewhere-preview-db` | `timewhere-preview-snapshots` | `timewhere-preview-cache` |
| prod | `timewhere-api` | `timewhere-web` | `timewhere-db` | `timewhere-snapshots` | `timewhere-cache` |

Recommended Worker bindings:

| Binding | Resource |
|---|---|
| `DB` | D1 canonical database |
| `SNAPSHOTS` | R2 migration snapshots and export backups |
| `APP_CACHE` | KV cache / dedupe / short-lived coordination |

## 8. Cloudflare Project Layout Direction

Current scaffold and target layout:

```text
workers/
  src/
    index.ts
    routes/
    services/
    repositories/
    migrations/
    auth/
  wrangler.toml

pages/
  src/
  public/
  package.json

docs/
  WEBDEV_*.md
```

Initial implementation scaffold now exists under `workers/` and `pages/` per D-048. The scaffold still uses placeholder Cloudflare resource ids only; creating resources, filling real ids, deployment, and production data migration remain separate Product Owner approvals.
