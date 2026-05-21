# CWS Private Submission Materials - TimeWhere 0.2.1

## Metadata

- Date: 2026-05-20
- Target: Chrome Web Store Private testing resubmission
- Candidate version: `0.2.1`
- CWS policy violation reference ID: `Purple Potassium`
- Policy fix: removed unnecessary `tabs` permission from submitted manifest.
- Package: `dist/TimeWhere-0.2.1-private-cws-sanitized-20260520-214913.zip`
- SHA256: `258CED7F544D8953A883EC01E28B6BF87691A9592D7AC2A2FA95B13D32F7DF23`
- Candidate commit: pending current working tree commit
- Test status: Lightweight verification selected by Product Owner; full `npm test` not run for this CWS resubmission.
- CWS packaging note: The CWS upload package is generated from a package copy with manifest `key` removed, because Chrome Web Store rejects submitted manifests containing `key`.
- Package verification: root `manifest.json` is present; submitted manifest version is `0.2.1`; submitted manifest has no `key`; submitted manifest has no `tabs` permission.
- CWS status: submitted to review; dashboard status verified as pending review.
- Boundary: Product Owner approved canceling the current CWS review, uploading the fixed `0.2.1` package, and resubmitting for review. Automatic publish after review remains unapproved and was disabled during submission.
- Post-submission source drift: current source now includes Chrome `sidePanel` permission and Side Panel / quick-add UI. Those changes are not part of the uploaded CWS package described by this material file; any future CWS update needs fresh package and permission/privacy evidence.

## Store Listing Draft

| Field | Draft value |
|---|---|
| Name | TimeWhere |
| Short description | 面向 IB 学生的个人任务、日程与每日执行管理工具。 |
| Category | 工作流程与规划 |
| Language | 中文（中国） |
| Visibility | Private testing |

Detailed description draft remains the current CWS listing text for TimeWhere:

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

Permission explanations:

| Manifest item | User-facing reason |
|---|---|
| `identity` | 用户主动启用 Google 数据同步时，通过 Chrome Identity 获取 Google 授权。 |
| `identity.email` | 用于确认/显示当前 Google 账号状态，帮助用户理解同步绑定的是哪个账号。 |
| `alarms` | 驱动本地任务提醒、每日总结快照和提醒检查。 |
| `notifications` | 向用户发送本地任务提醒和手动测试通知。 |
| `storage` | 保存扩展设置和少量运行状态。 |
| `unlimitedStorage` | 支持本地优先的任务、日程、课表、Journal 和同步状态数据。 |
| `https://managebac.com/student/events/*` | 只读取用户主动配置的 ManageBac events 订阅路径，用于任务/事件导入。 |
| `https://*.managebac.com/student/events/*` | 只读取用户主动配置的 ManageBac 子域 events 订阅路径，用于任务/事件导入。 |
| `https://managebac.cn/student/events/*` | 只读取用户主动配置的 ManageBac China events 订阅路径，用于任务/事件导入。 |
| `https://*.managebac.cn/student/events/*` | 只读取用户主动配置的 ManageBac China 子域 events 订阅路径，用于任务/事件导入。 |
| `https://www.googleapis.com/drive/v3/*` | 访问 Google Drive appDataFolder 元数据和文件内容，用于可选数据同步。 |
| `https://www.googleapis.com/upload/drive/v3/*` | 上传 TimeWhere 同步文件到用户自己的 Google Drive appDataFolder。 |

Notes:

- `tabs` is intentionally absent. Current `chrome.tabs.create()` usage opens extension-owned pages and does not require the `tabs` permission.
- Remote code use remains `No`.
- Google Drive use remains limited to optional appDataFolder sync.
- Minimum-permission consistency audit passed for the submitted permissions and host permissions; see `docs/release/RELEASE_GATE_REPORT_CWS_PRIVATE_0.2.1_2026-05-20.md`.
- ManageBac host permissions intentionally match the current source validator: HTTPS ManageBac `.com` / `.cn` root or subdomain hosts, restricted to `/student/events/*`.

## Distribution And Test Instructions

Distribution draft:

```text
Visibility: Private
Trusted testers: configured by Product Owner in Chrome Web Store Developer Dashboard only. Do not record tester emails in repository evidence.
Regions: All regions unless Product Owner chooses a narrower tester region.
Payment: Free.
Automatic publish after review: Not approved.
```

Reviewer/tester instructions:

```text
local features do not require login. open the toolbar popup, focus dashboard, task board, calendar, and settings. create a local task with a due date and check planner or calendar. google sync is optional with a test account. do not use real private managebac urls.
```

## Assets

| Asset | Path | Status |
|---|---|---|
| Extension icon 128x128 | `extension/icons/icon128.png` | PASS |
| Small promo 440x280 | `docs/release/cws-assets/0.2.0-private/small-promo-440x280.png` | PASS |
| Screenshot 1 1280x800 | `docs/release/cws-assets/0.2.0-private/01-focus-dashboard.png` | PASS |
| Screenshot 2 1280x800 | `docs/release/cws-assets/0.2.0-private/02-task-board.png` | PASS |
| Screenshot 3 1280x800 | `docs/release/cws-assets/0.2.0-private/03-settings.png` | PASS |
| Top promo 1400x560 | `docs/release/cws-assets/0.2.0-private/top-promo-1400x560.png` | Optional; not required for resubmission |

## Open Product Owner Decisions

- Automatic publish after review remains unapproved.
- Full automated test run remains intentionally not selected for this CWS policy-fix resubmission.
