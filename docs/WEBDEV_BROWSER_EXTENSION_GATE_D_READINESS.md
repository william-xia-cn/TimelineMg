# WebDev Browser Extension Gate D Readiness Packet

**状态**: Gate D readiness packet
**适用阶段**: Phase 8 Browser Extension ecosystem planning
**边界**: 本文只用于准备 Product Owner 审批；不批准、不开启、不实现 Browser Extension WebDev replay、Cloudflare runtime client、CWS 发布或公开发布。

## 1. Gate D 要回答的问题

Gate D 只讨论：

> Browser Extension 在 Cloud/Web-first 架构中的第一阶段生态组件范围是什么。

当前 Product Owner 尚未批准 Extension 第一阶段范围。默认仍保持：

- legacy MV3 extension 继续作为历史 Chrome Extension 产品线存在；
- WebDev v1 不把 Extension 作为主产品入口；
- Extension 不接入 WebDev Cloudflare endpoint；
- Extension 不实现 replay；
- Extension IndexedDB 不作为 canonical data source；
- 不提交 CWS、不上传新包、不创建 release。

## 2. 推荐第一阶段候选范围

如果未来批准 Gate D，建议候选能力保持很窄：

| 候选能力 | 默认建议 | 不包含 |
|---|---|---|
| 打开 Web / Desktop | 允许从浏览器快速打开 TimeWhere Web 或 Desktop | 不在 Extension 内重建完整业务 UI |
| 快速创建任务 | 通过 Cloud API 在线创建 Task | 离线 replay、批量导入、复杂冲突处理 |
| 当前任务查看 | 只读展示当前工作列表 | 本地 canonical data、独立 Daily Settle |
| 浏览器场景增强 | 可记录当前网页 context 或创建链接任务，需隐私评审 | 浏览器 URL/标题采集默认不开启 |

第一阶段不建议实现 Extension replay。若要采集浏览器使用数据或 URL/title，需要单独隐私设计和 Product Owner 批准。

## 3. 当前必须保持的阻断

Gate D 批准前必须保持：

- `extension/manifest.json` 不新增 WebDev Cloudflare host permissions。
- Extension runtime 不调用 `/sync/mutations`。
- Extension runtime 不包含 `workers.dev` / `timewhere-preview` / `timewhere-api` endpoint。
- root package 不新增 `webdev:extension:deploy`、`webdev:extension:replay`、`webdev:cws` 或 `webdev:release`。
- CWS 上传、提交审核、公开发布仍归 release gate，不由 Gate D readiness 自动触发。

## 4. Gate D 审批前证据

审批前至少需要最近一次通过：

```powershell
npm.cmd run webdev:extension:readiness
npm.cmd run webdev:verify
npm.cmd test
git diff --check
```

同时需要敏感信息扫描通过，确认不包含 token、cookie、OAuth secret、真实账号邮箱、Cloudflare secret、真实 resource id、本地私密路径或 raw migration snapshot。

## 5. Product Owner 后续审批项

如果要真正进入 Gate D 实施，仍需单独批准：

1. Browser Extension 第一阶段是否只做打开 Web/Desktop。
2. 是否允许在线快速创建 Task。
3. 是否允许只读当前任务查看。
4. 是否允许浏览器 URL / title 相关能力；如果允许，需要单独隐私 spec。
5. 是否需要 CWS 包、提交审核或发布；这属于 release gate，不由 Gate D 自动批准。

## 6. 明确不包含

Gate D 即使批准，也不包含：

- Extension offline replay；
- Extension local-over-cloud；
- Extension IndexedDB canonical；
- CWS upload / Submit for Review；
- public release；
- GitHub Release / tag / merge；
- Desktop package / signing / notarization；
- prod deployment。
