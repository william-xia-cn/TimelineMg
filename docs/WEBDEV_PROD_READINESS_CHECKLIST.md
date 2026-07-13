# WebDev Prod Readiness Checklist

**状态**: Gate R readiness checklist
**适用阶段**: Phase 10 prod release readiness
**边界**: 本文只定义 readiness，不批准 prod deployment、public release、GitHub Release、tag、merge、CWS、签名、公证或分发。

TimeWhere WebDev v1 的 prod readiness 目标是证明 Cloud-first / Web-first 架构可以进入正式环境评审。正式发布仍必须由 Product Owner 单独批准 Gate R。

## 1. 不等于发布

完成本文不代表：

- prod Cloudflare 资源已创建；
- 用户数据已迁移；
- public release 已批准；
- GitHub Release 已创建；
- CWS 已提交；
- Desktop Runtime 已签名、公证或分发；
- Browser Extension 已进入新阶段。

## 2. Readiness 输入

进入 prod readiness 评审前，至少需要：

- Phase 9 preview acceptance evidence 完整。
- Google SSO preview 测试通过。
- 自动迁移 preview 测试通过且无静默覆盖。
- 核心业务 smoke 通过。
- 数据备份/回滚策略已审查。
- 安全与隐私核查通过。
- Gate B/C/D/E/R 未批准项仍明确标注。

## 3. Prod 资源规划

prod 命名建议：

| 资源类型 | prod 命名建议 | Readiness 要求 |
|---|---|---|
| Worker | `timewhere-api` | 独立于 dev/preview；路由、CORS、auth、error envelope 已确认。 |
| Pages | `timewhere-web` | 域名、CSP、静态资源缓存策略已确认。 |
| D1 | `timewhere-db` | migrations、backup/export、restore drill 已确认。 |
| R2 | `timewhere-snapshots` | migration snapshot retention、access policy、lifecycle 已确认。 |
| KV | `timewhere-cache` | 只存短期状态；不得作为 canonical data。 |

仓库中只能保留命名模板，不能保留真实 Cloudflare account id、database id、API token 或 secret。

## 4. 数据与迁移 Readiness

必须证明：

- D1 是 canonical data source。
- IndexedDB 只作为 cache / migration source / pending queue。
- legacy snapshot 私密字段会被拒绝或清理。
- migration run 幂等。
- 多设备旧数据冲突进入 migration conflict table。
- migration conflict UI 不会空白失败。
- 迁移完成后本地旧 IndexedDB 不立即删除，可用于回滚/缓存。

回滚策略：

- 保留原始 migration snapshot。
- 保留 migration run 结果和 conflict resolution audit。
- 如 prod migration 暂停，应能阻止后续自动迁移而不影响用户登录。
- 如 D1 写入失败，应返回结构化错误，不写入半完成状态。

## 5. Auth / Session Readiness

必须证明：

- Google 只作为 SSO / OIDC。
- Worker 不保存 Google access token / refresh token。
- Web App 只保存 TimeWhere session。
- Session refresh 不接触 Google token。
- Logout 只注销 TimeWhere session，不撤销 Google 授权。
- Cookie / bearer / local storage 策略已安全审查。

## 6. API / Repository Readiness

Worker API 必须覆盖：

- `/auth/*`
- `/account/*`
- `/tasks/*`
- `/calendar/*`
- `/containers/*`
- `/settings/*`
- `/migration/*`
- `/sync/*`

Repository 必须是业务数据唯一入口：

- `TaskRepository`
- `CalendarRepository`
- `ContainerRepository`
- `SettingsRepository`
- `MigrationRepository`

业务代码不得直接依赖 D1、R2、KV、Chrome API 或 Electron IPC。

## 7. Offline / Sync Readiness

当前 prod readiness 默认边界：

- 本地 read cache 可用。
- 离线时禁止修改当前 Cloud canonical data。
- Task-only pending queue 可作为受控本地能力存在。
- user-facing replay 写 Cloud 仍需 Gate B。
- Calendar / Container / Settings replay 仍需 Gate C。
- local-over-cloud、batch conflict、full-entity offline-first 仍需单独批准。

任何扩大离线写入范围都必须停止并走 Product Owner approval。

## 8. Observability Readiness

正式 prod 前应有：

- Worker request/error log 策略。
- Structured error code mapping。
- Migration run audit visibility。
- Conflict count and unresolved age visibility。
- D1 backup/export cadence。
- R2 snapshot retention policy。
- Alerting for auth failures, migration failures, D1 errors, and elevated 5xx.

不得在日志中记录：

- token；
- cookie；
- OAuth secret；
- Google ID token；
- 真实账号邮箱；
- Cloudflare API token；
- 原始 private snapshot 内容。

## 9. Security / Privacy Readiness

必须完成：

- secret scan；
- dependency review；
- CORS review；
- CSP review；
- auth session expiry review；
- migration snapshot privacy review；
- R2 access policy review；
- D1 private-data column review；
- error message redaction review。

## 10. Desktop Runtime Readiness

Gate E 未批准前只做 readiness：

- Electron WebDev runtime mode 能加载 Web App。
- Desktop native bridge 只承载 window、tray、notification、autostart、secure storage、external link。
- Desktop 不承载 Task / Calendar / Daily Settle / Migration / Sync business logic。
- 内部包、签名、公证、自动更新、分发需单独批准。

## 11. Browser Extension Readiness

Gate D 未批准前只做方向记录：

- Browser Extension 是生态组件，不是主产品。
- 第一阶段范围待 Product Owner 批准。
- 不实现 Extension replay。
- 不把 Extension IndexedDB 作为 canonical data source。

## 12. Release Decision Package

进入 Gate R 审批前，应准备：

```text
Prod Readiness Package
Date:
Branch:
Commit:
Preview evidence reference:

Checks:
- Local verification:
- Preview acceptance:
- Migration evidence:
- Auth/session evidence:
- API/repository evidence:
- Offline/sync boundary evidence:
- Observability readiness:
- Security/privacy review:
- Desktop runtime readiness:
- Browser extension boundary:

Known limitations:
- Gate B:
- Gate C:
- Gate D:
- Gate E:

Rollback plan:

Decision requested:
- Approve prod resource creation?
- Approve prod deployment?
- Approve release announcement?
- Approve Desktop package/signing/distribution?
```

## 13. Stop Conditions

立即停止并回报 Product Owner：

- prod resource creation is required before Gate R approval。
- release/tag/GitHub Release/CWS is requested without explicit Gate R approval。
- migration evidence shows duplicate canonical rows or silent overwrite。
- auth/session logs require recording private identifiers。
- replay write Cloud needs to be enabled for user traffic。

## 14. Readiness Command

Gate R 批准前可运行只读静态门禁：

```powershell
npm run webdev:prod:readiness
```

该命令只检查仓库中的 readiness 文档、`workers/wrangler.toml` prod placeholder、env example、Gate R 边界、replay kill switch 和 secret hygiene。它不会创建 Cloudflare prod resource、不会部署 Worker/Pages、不会 tag、不会 release、不会修改远端状态。
