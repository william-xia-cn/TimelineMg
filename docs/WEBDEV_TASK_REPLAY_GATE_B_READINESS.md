# WebDev Task Replay Gate B Readiness Packet

**状态**: Gate B readiness packet
**适用阶段**: Phase 6 offline / sync v1 hardening
**边界**: 本文只用于准备 Product Owner 审批；不批准、不开启、不发布 Task replay 写 Cloud。

## 1. Gate B 要回答的问题

Gate B 只讨论一个窄问题：

> 是否允许 Web App 将本地 queued pending Task mutation 重放到 Cloud canonical D1。

默认建议范围仍然很窄：

- 仅 Task；
- 仅 `create` / `update` / `complete` / `reopen`；
- Task delete 继续保持用户侧阻断，除非 Product Owner 单独批准；
- Calendar / Container / Settings replay 不包含在 Gate B；
- Browser Extension replay 不包含在 Gate B；
- local-over-cloud 覆盖、批量冲突处理、全实体 offline-first 不包含在 Gate B；
- prod release 不包含在 Gate B。

## 2. 当前已具备的安全基础

当前代码已经具备以下只读或受控能力：

- Pages Task Repository 离线时可以把 Task `create` / `update` / `complete` / `reopen` 保存为 local pending intent。
- Pending Task 在 UI 中带有 pending 标记；不宣称 Cloud 已成功。
- Cloud bootstrap / change cursor hydrate 时保留本地 pending Task，不用 Cloud 新值静默覆盖 pending intent。
- Pending Task 在直接 Cloud edit / delete 前被阻断，用户必须先 retry preview 或 discard local pending。
- `/sync/mutations` 默认仍返回 `disabled_v1`，`accepted=false`，`writes_enabled=false`。
- `/sync/mutations/dry-run`、`/sync/mutations/readiness-summary`、`/sync/mutations/enablement-simulation` 只做预览和证据汇总，均保持 `writes_enabled=false`。
- `/sync/replay-safety` 始终报告 `writes_enabled=false`、`applies_user_data=false`、`can_run_replay=false`。
- test-only Task replay 写入口只允许 `dev/local/test` 环境；preview/prod 不允许通过 `test_only_task_replay_enabled` 执行写入。
- Worker 已有 Task-only gate、ManageBac source field block、private-field rejection、field-level conflict preview、idempotent mutation outcome、single Task conflict record scaffolding。

## 3. Gate B 前必须保留的阻断

在 Product Owner 明确批准 Gate B 前，以下阻断必须保持：

- Web App 不自动调用真实 replay apply。
- Settings 的 pending queue 只能执行 retry preview / discard local pending。
- `writes_enabled` 不得在用户可见路径变成 `true`。
- `TIMEWHERE_TASK_REPLAY_KILL_SWITCH` 默认保持 `on`。
- `TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED` 默认保持 `false`。
- `workers/wrangler.toml` prod resource id 仍为 placeholder。
- 不新增 `webdev:prod:deploy`、`webdev:release` 或 Extension / Desktop 发布脚本。

## 4. Gate B 审批时需要的证据

审批前至少需要最近一次通过：

```powershell
npm.cmd run webdev:gate-b:readiness
npm.cmd run webdev:verify
npm.cmd test
git diff --check
```

同时需要变更文件敏感模式扫描通过，确认不包含：

- token；
- cookie；
- OAuth secret；
- 真实账号邮箱；
- Cloudflare secret 或真实 resource id；
- 本地私密路径；
- raw migration snapshot。

## 5. Product Owner 后续审批项

如果要真正进入 Gate B 实施，仍需单独批准：

1. 用户侧 Task replay 写 Cloud 是否开启。
2. Gate B 第一版是否只包含 `create/update/complete/reopen`，并继续阻断 Task delete。
3. Pending UX 采用 `queued_pending`，而不是 draft-only 或继续完全 blocked。
4. 失败 replay 的用户路径：retry preview、discard local pending、进入 single Task conflict review。
5. 是否允许 preview 环境做受控真实 replay smoke。

## 6. 明确不包含

Gate B 即使批准，也不包含：

- Calendar / Container / Settings replay；
- Browser Extension replay；
- Desktop background replay；
- local-over-cloud 覆盖；
- 批量冲突处理；
- 全实体 offline-first；
- prod deployment；
- public release / GitHub Release / tag / CWS / Desktop package。
