# WebDev Non-Task Replay Gate C Readiness Packet

**状态**: Gate C readiness packet
**适用阶段**: Phase 6 offline / sync v1 hardening
**边界**: 本文只用于准备 Product Owner 审批；不批准、不开启、不实现 Calendar / Container / Settings replay。

## 1. Gate C 要回答的问题

Gate C 只讨论：

> 是否在 Task-only replay 之外，继续实现 Calendar / Container / Settings 的离线 mutation queue 与 replay 写 Cloud。

Gate C 不应被 Task-only pending、Task replay dry-run、preview smoke 或 prod readiness 自动带开。当前默认仍是：

- Calendar 离线写入阻断；
- Container / Plan / Bucket / Label 离线写入阻断；
- Settings 离线写入阻断；
- Worker replay 只允许 Task gate，非 Task replay 返回 `entity_replay_not_in_task_gate`；
- Web App 不展示非 Task pending queue 或非 Task retry/discard 控件。

## 2. 推荐审批拆分

如果未来批准 Gate C，建议继续拆成三个子 gate，而不是一次性打开全部非 Task replay：

| 子 gate | 默认范围 | 暂不包含 |
|---|---|---|
| C1 Calendar | 单个 calendar event create / update / delete | 复杂 recurring series merge、跨日批量重排 |
| C2 Structure | Plan / Bucket / Label / Container create / update / disable / reorder | 删除仍被 Task 引用的结构、批量 remap |
| C3 Settings | 明确批准的 product settings | runtime / account / auth / sync / migration / device-local settings |

推荐先完成 Gate B 的 Task replay preview evidence，再评审 Gate C。否则非 Task replay 会把依赖顺序、关系校验和冲突面扩大太快。

## 3. 当前必须保持的阻断

在 Product Owner 明确批准 Gate C 前：

- `CalendarRepository` 离线 create / update / delete 必须抛出 `offline_write_blocked`。
- `StructureRepository` 离线 Plan / Bucket / Label / Container write 必须抛出 `offline_write_blocked`。
- `SettingsRepository` 离线 update 必须抛出 `offline_write_blocked`。
- 非 Task mutation 不得进入用户可见 replay apply。
- Settings 只允许展示 Task pending queue，不允许展示 Calendar / Container / Settings pending queue。
- Worker `/sync/mutations`、`/sync/mutations/dry-run`、`/sync/mutations/readiness-summary` 可以诊断非 Task 样本，但必须保持 `writes_enabled=false`。
- test-only replay 仍必须拒绝非 Task mutation。

## 4. Gate C 审批前证据

审批前至少需要最近一次通过：

```powershell
npm.cmd run webdev:gate-c:readiness
npm.cmd run webdev:gate-b:readiness
npm.cmd run webdev:verify
npm.cmd test
git diff --check
```

同时需要变更文件敏感模式扫描通过，确认不包含 token、cookie、OAuth secret、真实账号邮箱、Cloudflare secret、真实 resource id、本地私密路径或 raw migration snapshot。

## 5. Product Owner 后续审批项

如果要真正进入 Gate C 实施，仍需单独批准：

1. 是否按 C1 / C2 / C3 分批。
2. Calendar recurring series 是否纳入第一版。
3. Container replay 是否允许 reorder / disable，还是只允许普通字段 update。
4. Settings replay 的白名单。
5. 非 Task conflict UX 是复用 single Task conflict review，还是另建 entity-specific review。
6. 是否允许 preview 环境做非 Task replay smoke。

## 6. 明确不包含

Gate C 即使批准，也不包含：

- Browser Extension replay；
- Desktop background replay；
- local-over-cloud 覆盖；
- 批量冲突处理；
- 全实体 offline-first；
- prod deployment；
- public release / GitHub Release / tag / CWS / Desktop package。
