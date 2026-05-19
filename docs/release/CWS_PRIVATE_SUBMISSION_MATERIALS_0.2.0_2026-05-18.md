# CWS Private Submission Materials - TimeWhere 0.2.0

## Metadata

- Date: 2026-05-18
- Target: Chrome Web Store Private testing listing materials
- Candidate version: `0.2.0`
- Historical note: current source/package version has moved to `0.2.1` for internal stabilization; no `0.2.1` CWS package has been generated from these materials.
- Package: `dist/TimeWhere-0.2.0-private-cws-sanitized-20260519-012614.zip`
- SHA256: `4A77450F9378185B9269A42453EF848939EF745037A3FC9155E0E60F9C8E7D3B`
- Candidate commit: `753ac44`
- Extension ID: `ogdjmelmfkfahppahhkkggdejjainbnd`
- Test status: Automated and browser tests were not run for this regenerated package per Product Owner instruction.
- CWS packaging note: The CWS upload package is generated from a package copy with manifest `key` removed, because Chrome Web Store rejects submitted manifests containing `key`. Source `extension/manifest.json` still keeps `key` for local fixed-ID OAuth testing.
- Boundary: Do not upload, Submit for Review, publish, public-list, tag, push, merge, deploy, or release without explicit Product Owner approval.

## Store Listing Draft

| Field | Draft value |
|---|---|
| Name | TimeWhere |
| Short description | 面向 IB 学生的个人任务、日程与每日执行管理工具。 |
| Category | Productivity |
| Language | Chinese-first listing copy |
| Visibility | Private testing |

Detailed description draft:

```text
TimeWhere 是一个面向 IB 学生的个人时间管理 Chrome 扩展，帮助学生把任务、课程日程、每日执行和复盘整理在同一个本地优先的工作流中。

核心功能：
- Task Board：按日期、Bucket、Plan 和 Calendar 视图管理任务。
- Focus Dashboard：查看当前任务、今明日日程、本周进度和每日总结入口。
- Calendar：管理学习容器、日程事件和任务日期视图。
- MatrixView / ManageBac 支持：从学校导出的课表或用户提供的 ManageBac 订阅信息辅助建立学习计划和任务。
- Daily Journal：记录每日执行结果，并生成周总结视图。
- Local reminders：为明确排期任务和当前任务提供本地 Chrome 通知提醒。
- Optional Google data sync：用户可选择使用 Google Drive appDataFolder 在自己的设备之间同步 TimeWhere 数据；不连接 Google 账号也可以正常使用核心功能。

TimeWhere 当前作为 Private testing 版本提供给可信测试用户验证。它不是公开发布版本。
```

## Privacy And Permissions Draft

Single purpose:

```text
TimeWhere 的单一用途是帮助学生在浏览器中规划个人任务、课程日程、每日执行和复盘，并在用户选择时通过 Google Drive appDataFolder 在自己的设备之间同步 TimeWhere 数据。
```

Data handling disclosure:

```text
TimeWhere 处理用户主动输入或导入的任务、日程、计划、课表、ManageBac 订阅配置、每日总结和本地设置。默认情况下，这些数据保存在用户浏览器本地 IndexedDB / Chrome storage 中。

如果用户启用 Google 数据同步，TimeWhere 会把 TimeWhere 应用数据同步到该用户 Google Drive 的 appDataFolder 中，用于跨设备同步。TimeWhere 不使用 Google Calendar 或 Google Tasks，不出售用户数据，不用于广告，不向第三方共享用户数据。

ManageBac 订阅链接可能包含用户学校系统生成的私密访问 URL。TimeWhere 仅在用户主动配置时使用该链接读取课程/任务信息；该链接不得写入公开仓库、截图或公开证据。如果用户启用 Google 数据同步，该配置会作为 TimeWhere 数据的一部分在用户自己的 Google Drive appDataFolder 中同步。

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.
```

Permission explanations:

| Manifest item | User-facing reason |
|---|---|
| `identity` | 用户主动启用 Google 数据同步时，通过 Chrome Identity 获取 Google 授权。 |
| `identity.email` | 用于确认/显示当前 Google 账号状态，帮助用户理解同步绑定的是哪个账号。 |
| `alarms` | 驱动本地任务提醒、每日总结快照和提醒检查。 |
| `notifications` | 向用户发送本地任务提醒和手动测试通知。 |
| `storage` | 保存扩展设置和少量运行状态。 |
| `tabs` | 从 popup 或通知点击打开 TimeWhere 的 Dashboard / Focus 页面。 |
| `unlimitedStorage` | 支持本地优先的任务、日程、课表、Journal 和同步状态数据。 |
| `https://keystoneacademy.managebac.cn/student/events/*` | 只读取用户配置的 Keystone ManageBac events 订阅路径，用于任务/事件导入。 |
| `https://www.googleapis.com/drive/v3/*` | 访问 Google Drive appDataFolder 元数据和文件内容，用于可选数据同步。 |
| `https://www.googleapis.com/upload/drive/v3/*` | 上传 TimeWhere 同步文件到用户自己的 Google Drive appDataFolder。 |

## Distribution And Test Instructions

Distribution draft:

```text
Visibility: Private
Trusted testers: configured by Product Owner in Chrome Web Store Developer Dashboard only. Do not record tester emails in repository evidence.
Regions: All regions unless Product Owner chooses a narrower tester region.
Payment: Free.
```

Reviewer/tester instructions draft:

```text
This is a Private testing build of TimeWhere 0.2.0.

Basic smoke:
1. Install the extension and open the toolbar popup.
2. Open Focus Dashboard from the popup or extension pages.
3. Open Task Board / Planner and create a local test task with a due date.
4. Open Calendar and verify the calendar view loads.
5. Open Settings and verify local preferences, reminder settings, Google data sync section, MatrixView import, and ManageBac configuration sections are visible.

Privacy-sensitive features:
- Google data sync is optional. TimeWhere works without signing in.
- If testing Google sync, use a test Google account only. The extension stores TimeWhere sync data in Google Drive appDataFolder.
- Do not use or request a real private ManageBac subscription URL in review evidence. ManageBac import requires a user-provided school subscription link and should be tested only with non-private or redacted data.
- No paid account is required for core local-first task, calendar, dashboard, and settings flows.
```

## Assets

| Asset | Path | Status |
|---|---|---|
| Extension icon 128x128 | `extension/icons/icon128.png` | PASS |
| Small promo 440x280 | `docs/release/cws-assets/0.2.0-private/small-promo-440x280.png` | PASS |
| Screenshot 1 1280x800 | `docs/release/cws-assets/0.2.0-private/01-focus-dashboard.png` | PASS |
| Screenshot 2 1280x800 | `docs/release/cws-assets/0.2.0-private/02-task-board.png` | PASS |
| Screenshot 3 1280x800 | `docs/release/cws-assets/0.2.0-private/03-settings.png` | PASS |

## Official References

- https://developer.chrome.com/docs/webstore/publish
- https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/program-policies/policies

## Open Product Owner Decisions

- Approve or reject actual Chrome Web Store Developer Dashboard upload.
- Approve or reject Submit for Review after dashboard fields are filled.
- Confirm trusted tester accounts in the Developer Dashboard without recording them in repo evidence.
- Accept or reject the risk of using the regenerated package without automated/browser tests.
- After CWS upload assigns/confirms the store item ID, update Google OAuth Chrome Extension client configuration if the CWS extension ID differs from the local fixed development ID.
