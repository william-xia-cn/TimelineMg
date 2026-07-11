# TimeWhere Web App Scaffold

本目录是 WebDev v1 的 Cloudflare Pages + Vite + React 初始 Web App scaffold。

## 定位

- Web App 是目标架构中的主要业务实现入口。
- 当前 scaffold 提供 Dashboard / Tasks / Calendar / Settings 壳层、Google SSO UI、Repository client、Platform adapter 和自动迁移入口预览。
- Tasks 已进入 WebDev Task-only queued pending 阶段：通过 Repository 访问 Worker `/tasks`，在线时支持 Cloud-backed 创建、完成/重开、删除、搜索/筛选；离线且已有 Google SSO session 时，Task create/update/complete/reopen 写入本地 pending queue 并标记待同步，delete 仍需联网。
- Calendar Events 已进入第一版 WebDev 迁移实现：通过 Repository 访问 Worker `/calendar/events`，支持 Cloud-backed 创建、删除、搜索和本地只读 cache。
- Plans / Labels / Buckets / Containers 已进入第一版 WebDev 迁移实现：通过 Repository 访问 Worker `/plans`、`/labels`、`/buckets` 和 `/containers`，在 Settings 中提供基础结构管理，并保留本地只读 cache。
- Settings 已进入第一版 WebDev 迁移实现：通过 Repository 访问 Worker `/settings`，支持基础偏好保存、本地只读 cache 和离线写入阻断。
- Dashboard 已接入第一版 Daily Settle 只读投影 helper：基于当前 Tasks 与 Containers 显示当前容器和投影当前工作，不在本地写入自动排布结果。
- Task detail 已进入第一版 WebDev 迁移实现：可从任务列表打开详情，编辑 title、日期、计划、bucket、labels、checklist、notes 等 Cloud 字段。
- Calendar date projection 已进入第一版 WebDev 迁移实现：按选定日期聚合 containers、calendar events 与 tasks，提供当天时间线视图。
- Reminder state UI 已进入第一版 WebDev 迁移实现：基于当前任务与提醒设置显示 due / idle / disabled 状态，不发送系统通知。
- Migration conflict review 已进入第一版 WebDev 迁移实现：自动迁移发现同 legacy_id 的云端记录已变化时写入 open conflict，跳过本次覆盖；Settings 中可读取 open conflicts 并标记 use_cloud / use_local / skip。
- Sync replay diagnostics 已进入 disabled/internal 第一版：Settings 可读取 `/sync/mutations` 中 sanitized replay outcomes 和 Task gate 详情，用于开发排查；不启用离线写入，也不显示原始 patch/base/cloud payload。
- Sync conflict review 已进入 Phase 3：Settings 可读取 `/sync/conflicts` 中 sanitized Task conflict records，并支持单条 `keep_cloud` / `discard_local` / `later`；不会把本地值覆盖到 Cloud。
- 旧 Extension/Desktop 业务逻辑尚未迁移到这里；后续迁移必须按 Repository / Platform contracts 分阶段执行。

## 本地命令

```powershell
npm --prefix pages run dev
npm --prefix pages run build
npm --prefix pages run preview
```

默认 Vite dev server 监听 `127.0.0.1:4173`，并把 `/api` 代理到本地 Worker `127.0.0.1:8787`。

Google SSO 使用公开的 Web OAuth client id，通过环境变量注入，不需要也不能配置 client secret：

```powershell
$env:VITE_GOOGLE_OIDC_CLIENT_ID = "your-web-client-id.apps.googleusercontent.com"
npm --prefix pages run dev
```

Worker 侧需要配置同一个 `GOOGLE_OIDC_CLIENT_ID`，用于校验 Google ID token 的 audience。

## 离线策略

WebDev 当前离线策略按 D-049 进入 Task-only queued pending，非 Task 数据仍保持离线写入阻断：

- 可以显示最后一次 local cache；
- Task create/update/complete/reopen 可进入本地 `queued` mutation queue，并在 UI 中显示 `Pending sync`；
- Task delete 暂不允许离线执行，仍返回 `offline_write_blocked`；
- Calendar / Container / Structure / Settings 离线写入继续禁用或返回 `offline_write_blocked`；
- 本地 pending 不等于 Cloud 已同步，Cloud 成功必须等待后续 Worker replay 确认；
- Task sync conflict 单条处理已支持 `keep_cloud` / `discard_local` / `later`；生产 replay、非 Task replay、批量冲突处理、本地覆盖云端仍按后续阶段单独批准。

## 当前边界

- 不部署 Pages。
- 不内置 Google OAuth client id；本地与 Cloudflare 环境必须显式配置公开 Web client id。
- 不迁移旧 IndexedDB 数据。
- 不修改 Chrome Extension 或 Electron Runtime 业务逻辑。
