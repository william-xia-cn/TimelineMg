# TimeWhere Desktop MCP / MDP Agent Interface

**状态**: Desktop MCP task CRUD v1 implementation
**日期**: 2026-08-01

## 命名与边界

仓库内原本没有既有 `MDP` 或 `MCP` 接口概念。当前实现采用两层命名：

- `MDP` (`Minimal Data Protocol`) 是 renderer 内的业务接口层，复用 `TimeWhereDB` 并负责任务 CRUD、字段 allowlist、幂等、删除审计和 profile 校验。
- `MCP` 是 Desktop Electron 侧的本地 stdio 协议入口，通过本机 IPC socket 转发到已打开的 Desktop renderer。

Chrome Extension / Side Panel 不作为 MCP server，不新增 Chrome 权限，不通过 Chrome 控件模拟点击任务。Desktop MCP 只操作当前 TimeWhere Desktop active profile；profile 切换后旧 MCP 会收到 `profile_changed`。

## 运行结构

```text
MCP client
  -> stdio: platforms/desktop-electron/mcp-stdio-server.js
  -> local IPC socket: TimeWhere Desktop main process
  -> Electron preload: TimeWhereElectronPlatform.onMcpRequest
  -> renderer: TimeWhereMcpRendererBridge
  -> TimeWhereMDPAgentInterface
  -> TimeWhereDB / IndexedDB
```

Desktop 未打开、renderer 未 ready 或 active profile 已变化时，tool call 返回错误，不直接读 IndexedDB 文件，也不修改 Google Drive sync document 或 IndexedDB schema。

## MCP tools

| Tool | 用途 | 写入要求 |
|---|---|---|
| `timewhere_tasks_list` | 查询当前 profile 任务摘要 | 只读 |
| `timewhere_task_get` | 读取单条任务详情 | 只读 |
| `timewhere_task_create` | 创建 manual task | `idempotency_key` |
| `timewhere_task_update` | 更新 allowlist 内任务字段 | `idempotency_key` |
| `timewhere_task_delete` | 删除任务 | `idempotency_key` + `user_confirmed=true` |
| `timewhere_task_start` | 标记 in progress | `idempotency_key` |
| `timewhere_task_complete` | 标记 completed | `idempotency_key` |
| `timewhere_task_reopen` | 标记 not started | `idempotency_key` |

任务 list 输出包含 `id/title/plan_id/bucket_id/start_date/due_date/schedule_time/duration/priority/progress/source/readonly/notes`。任务详情额外包含 `description/checklist/labels/completed_at/created_at/updated_at/recurrence_*`。

## 写入与隐私规则

- 所有写入必须有 `idempotency_key`，幂等结果保存在本地 setting `mcp_idempotency_log`。
- 删除必须显式传 `user_confirmed=true`，删除前写入本地 `mcp_audit_log` 摘要。
- `notes/description` 在 v1 中允许 Agent 读写。
- ManageBac 来源任务仍不能通过 update 修改来源事实字段；普通本地字段由现有 DB 写入口继续保护。
- MCP 不接受任意 `user_id` 参数，不跨 profile 操作数据。
- MCP 不返回 OAuth token、cookies、Google account key、raw import source URL 或 Google sync metadata。

## 标准注册方式

TimeWhere 的标准 MCP server 显示名是 `timewhere-desktop-mcp`。Codex 全局配置 key 使用 `timewhere_desktop_mcp`，以匹配 Codex 工具命名空间规则；本机注册由仓库脚本维护：

```powershell
powershell -ExecutionPolicy Bypass -File tools/register-timewhere-mcp.ps1
```

脚本通过官方 Codex CLI 注册，等价于：

```powershell
codex mcp add timewhere_desktop_mcp -- "C:\Program Files\nodejs\node.exe" "D:\Codex\ThmeWhere-Master\platforms\desktop-electron\mcp-stdio-server.js"
```

注册后用官方 CLI 验证：

```powershell
codex mcp list --json
```

注册 MCP 只负责让工具进入 Codex 可调用工具集。Agent 的日常调用规范由 `timewhere-task` skill 维护。该 skill 随 TimeWhere Desktop 发布包携带，portable 启动时会 best-effort 安装/更新到用户 Codex skill 目录，安装目标为：

```text
C:\Users\William\.codex\skills\timewhere-task\SKILL.md
```

该 skill 的显示名是 `TimeWhere Task`，源文件随 Desktop package 位于 `agent-skills/timewhere-task`。它用于读取 Dashboard 当前任务、任务增删改查、start/complete/reopen 等请求，并规定优先调用 TimeWhere MCP，不使用 Chrome 控件，不直接读 IndexedDB，写入必须带 `idempotency_key`，删除必须有显式确认。安装或更新后，需要新开 Codex 会话才会加载新 skill metadata。

Plugin 不是 TimeWhere MCP 的主标准入口；只有在需要分发一组 MCP/skills/apps 能力时才考虑使用 plugin。

注册后，新开的 Codex 会话应能发现 `timewhere-desktop-mcp`。使用前必须打开 TimeWhere Desktop，并等待页面加载完成；Desktop 未打开或 renderer 未 ready 时返回 `desktop_not_ready`。底层手动启动命令仍是：

```bash
npm --prefix platforms/desktop-electron run mcp:stdio
```

Desktop main process 和 stdio MCP server 默认使用稳定 app id `cn.williamxia.timewhere` 计算本机 bridge path，因此 Windows portable exe 解包到临时目录时不需要手动指定 pipe。`TIMEWHERE_MCP_BRIDGE_PATH` 和 `TIMEWHERE_MCP_BRIDGE_SEED` 仅作为高级覆盖，用于 smoke test 或特殊部署。

标准只读调用示例：先调用 `timewhere_tasks_list`，参数 `{ "progress": "in_progress", "limit": 10 }` 读取当前 active profile 的进行中任务摘要；需要完整字段时再对目标 `task_id` 调用 `timewhere_task_get`。

## 测试

- `node tests/mdp-agent-interface.test.js`
- `node tests/mcp-desktop.test.js`
- `node tests/platform-boundary.test.js`
- `npm run electron:smoke`

当前实现不包含 localhost HTTP，不包含后台常驻服务，不包含 Chrome Web Store 发布或权限变更。
