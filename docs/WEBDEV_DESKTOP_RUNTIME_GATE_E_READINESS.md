# WebDev Desktop Runtime Gate E Readiness Packet

**状态**: Gate E readiness packet
**适用阶段**: Phase 7 Desktop Runtime repositioning
**边界**: 本文只用于准备 Product Owner 审批；不批准、不开启、不执行 Desktop internal package、签名、公证、自动更新、分发或公开发布。

## 1. Gate E 要回答的问题

Gate E 只讨论：

> Desktop Runtime 在 Cloud/Web-first 架构中如何作为低频 native shell 被打包、签名、分发和更新。

当前 Product Owner 尚未批准 Desktop Runtime 包、签名、公证、自动更新或分发策略。默认仍保持：

- Electron v1 继续作为 Desktop Runtime 默认方向；
- WebDev runtime mode 仍是 opt-in，本地 smoke 证据不等于发布包；
- legacy extension shell 仍是 Electron 默认加载路径；
- Desktop Runtime 不承载 Task / Calendar / Container / Daily Settle 业务逻辑；
- Desktop native bridge 只暴露 window、tray、notification、secure storage、system、external link 等能力；
- 不生成 Windows / macOS WebDev 内部包；
- 不签名、不公证、不 staple；
- 不创建 installer、auto-update feed、GitHub Release、tag 或 public release。

## 2. 推荐 Gate E 第一阶段候选范围

如果未来批准 Gate E，建议第一阶段只覆盖内部 preview runtime：

| 候选能力 | 默认建议 | 不包含 |
|---|---|---|
| Electron Runtime loading | 允许加载 stable Web App preview / prod URL | 不把业务逻辑复制回 Electron |
| Native bridge | 保留 tray / notification / autostart / secure storage / external link | 不暴露 Task / Calendar / Migration 业务 API |
| Internal package | 仅在批准后生成内部 Windows / macOS 包 | 不等同公开 release |
| Signing strategy | 后续单独决策 self-signed internal 或 Developer ID | 当前不签名、不公证 |
| Auto update | 先做设计，不默认实现 | 不创建更新源或强制升级机制 |

第一阶段不建议替换 Electron runtime。若要切到 Tauri、Swift shell 或其他 runtime，需要单独架构决策。

## 3. 当前必须保持的阻断

Gate E 批准前必须保持：

- `npm run webdev:desktop:readiness` 只做静态检查，不启动 Electron。
- `npm run webdev:desktop:smoke` 只启动本地 Worker / Pages 与 Electron smoke，不生成包。
- root package 不新增 `webdev:desktop:package`、`webdev:desktop:sign`、`webdev:desktop:notarize`、`webdev:desktop:update`、`webdev:desktop:release` 或等价 release script。
- Electron WebDev runtime mode 不直接读写 Cloud canonical data；业务访问仍通过 Web App / Worker API。
- Desktop preload 不暴露 Task / Calendar / Migration 业务 API。
- 不上传、分发、发布或签名任何 Desktop WebDev artifact。

## 4. Gate E 审批前证据

审批前至少需要最近一次通过：

```powershell
npm.cmd run webdev:desktop:readiness
npm.cmd run webdev:desktop:smoke
npm.cmd run webdev:verify
npm.cmd test
git diff --check
```

同时需要敏感信息扫描通过，确认不包含 token、cookie、OAuth secret、真实账号邮箱、Cloudflare secret、真实 resource id、本地私密路径、证书、私钥或 signing password。

## 5. Product Owner 后续审批项

如果要真正进入 Gate E 实施，仍需单独批准：

1. Desktop v1 是否继续 Electron，或是否评估替换 runtime。
2. 内部包是否加载 preview URL、prod URL，还是 local bundled Web App。
3. Windows 和 macOS 的内部包格式。
4. 是否采用 self-signed internal signing、Developer ID signing，或继续 unsigned internal build。
5. 是否实现自动更新；如果实现，需要独立 update manifest / checksum / rollback 设计。
6. 是否进入 GitHub Release、public release 或其他分发渠道；这属于 release gate，不由 Gate E readiness 自动批准。

## 6. 明确不包含

Gate E 即使批准，也不自动包含：

- prod deployment；
- GitHub Release / tag / merge；
- CWS upload / Submit for Review；
- Developer ID notarization；
- stapling；
- auto-update implementation；
- Browser Extension replay；
- Task / Calendar / Container / Settings replay write enablement；
- Desktop 业务逻辑迁回 Electron；
- Google Drive Sync / Google Tasks / Google Calendar 作为新架构同步方案。
