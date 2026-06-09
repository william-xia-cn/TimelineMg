# TimeWhere 部署指南

本文档记录 TimeWhere 扩展从本地开发完成到最终发布上线所需补充和完成的工作。

> Current stage warning (2026-05-15): This document is future release reference plus Google data sync setup reference. Product Owner has approved D-019 Google data sync planning and v0.1 implementation work, but not public release. Chrome Web Store submission, public deployment, tag, push, merge, publish, deploy, upload, or submit remain unapproved.

---

## macOS 内部自签名路线（限定机器）

当前另有一条 **限定 Mac 机器内部使用** 的 macOS 路线，详见：

- `docs/release/MACOS_INTERNAL_SELF_SIGNED_RELEASE.md`

该路线只适用于管理员管理的少量 Mac，并且只覆盖 TimeWhere.app：

- 使用内部自签名 Code Signing 证书；
- 目标机器手动导入并信任证书；
- 签名、验证、打包和 SHA256 都针对最终 TimeWhere.app 内部产物；
- Usage Agent 是外部项目，不在本仓库开发、安装、签名、配置或管理；
- TimeWhere 未来如需读取 usage 数据，必须等待外部接口文档明确后再做单独计划。

边界：

- 自签名内部包不是 Developer ID signed build；
- 自签名内部包不能等同 notarized public build；
- 不创建 GitHub Release；
- 不做 Developer ID notarization / stapling；
- 不实现自动更新；
- 不引入 Network Extension / Endpoint Security / System Extension；
- 不在本仓库实现 Usage Agent 安装、LaunchAgent、保活、权限或日志保留策略。

公开 macOS 发布仍需要 Apple Developer Program、Developer ID Application certificate、hardened runtime、notarization、stapling 和 Gatekeeper 验证。

---

## 一、部署前准备

### 1.1 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目：`TimeWhere`
3. 启用以下 API：
   - Google Drive API

### 1.2 创建 OAuth 2.0 客户端（Google 数据同步）

Google OAuth client 是 TimeWhere 这个扩展应用的身份标识，不是开发者账号的数据存储位置。用户授权后，TimeWhere 读写的是该用户自己的 Google Drive `appDataFolder`；开发者不拥有、不托管、不读取用户同步数据。

1. 进入 **APIs & Services** → **Credentials**
2. 点击 **Create Credentials** → **OAuth client ID**
3. 选择 **Chrome Extension** 类型
4. 填写信息：
   - Name: `TimeWhere OAuth`
   - Application ID / Extension ID: 使用当前固定开发 ID `ogdjmelmfkfahppahhkkggdejjainbnd`
   - **不要填写重定向 URI**（Chrome 扩展类型自动识别）
5. 保存生成的 `CLIENT_ID`（格式：`[xxx].apps.googleusercontent.com`）

Current development OAuth client:

- Project: `TimeWhere`
- Extension ID: `ogdjmelmfkfahppahhkkggdejjainbnd`
- Google Drive API: enabled
- OAuth scope: `https://www.googleapis.com/auth/drive.appdata`

Current CWS OAuth client:

- Project: `TimeWhere`
- Extension ID: `bokjekfjghliieopghopibmhjokgkjkb`
- OAuth client ID: `541406150907-u6pvenpfdpgfmgnv8h9f126l4hc4oru9.apps.googleusercontent.com`
- Google Drive API: enabled
- OAuth scope: `https://www.googleapis.com/auth/drive.appdata`

---

## 二、配置 Manifest

### 2.1 添加 OAuth 配置（Google 数据同步）

当前 Google 数据同步只使用 Google Drive `appDataFolder`。不要为第一阶段添加 Google Tasks、Google Calendar 或 email/profile scope。

`manifest.json` 应包含：

```json
{
  "oauth2": {
    "client_id": "[configured Chrome Extension OAuth client ID].apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/drive.appdata"
    ]
  }
}
```

真实授权 smoke 前，需要在 Chrome 里重新加载 unpacked extension，确认实际扩展 ID 为 `ogdjmelmfkfahppahhkkggdejjainbnd`。没有真实 client ID 时，TimeWhere 应显示 `未配置`，本地功能不受影响。

### 2.2 固定开发扩展 ID

为确保开发期 OAuth client 稳定，需要在 `manifest.json` 中保留 `key` 字段。`key` 是公钥，可提交；对应私钥必须保存在 repo 外，不能提交。

当前固定开发扩展 ID：

```text
ogdjmelmfkfahppahhkkggdejjainbnd
```

`manifest.json` 已包含：

```json
{
  "key": "<public key>"
}
```

如果未来重新生成 key，扩展 ID 会改变，必须同步重建 Google Cloud Chrome Extension OAuth client。

### 2.3 CWS 包 OAuth 配置

源码 `extension/manifest.json` 保留开发扩展 ID 对应的 OAuth client 和 `key`，用于未发布 / unpacked 扩展真实授权测试。Chrome Web Store 上传包必须移除 `key`，因此 CWS 包需要使用商店扩展 ID 对应的 OAuth client。

生成 CWS 包时使用：

```powershell
npm run package:cws
```

该脚本会在 staging manifest 中：

- 移除 `key`；
- 设置 CWS OAuth client ID；
- 保留 Drive `appDataFolder` scope；
- 输出 `dist/TimeWhere-[version]-private-cws-sanitized-[timestamp].zip`。

### 2.4 少量可信测试者本地包

给少量可信测试者临时使用时，不要分发 CWS sanitized zip。应生成 local unpacked 包：

```powershell
npm run package:local
```

该包会输出 `dist/TimeWhere-[version]-local-unpacked-[timestamp].zip`，zip 内只有一个 `extension/` 文件夹。测试者应解压后在 `chrome://extensions` 开启开发者模式，选择解压后的 `extension` 文件夹进行“加载已解压的扩展程序”。

安装后必须确认扩展 ID 为：

```text
ogdjmelmfkfahppahhkkggdejjainbnd
```

如果显示其他 ID，说明加载错包、加载错目录或 `manifest.key` 丢失；不要继续测试 Google 同步。

---

## 三、打包扩展

### 3.1 打包步骤

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启 **开发者模式**
3. 点击 **打包扩展程序**
4. 选择扩展目录：`D:\Opencode\TimelineMg\extension`
5. 点击 **打包扩展程序**
6. 生成两个文件：
   - `.crx` 文件（可分发的扩展）
   - `.pem` 文件（私钥，妥善保管）

### 3.2 获取 Public Key（可选）

如果需要固定扩展 ID：
1. 上传 `.crx` 到 [Chrome 开发者后台](https://chrome.google.com/webstore/developer/dashboard)（不发布）
2. 进入 **Package** 标签
3. 点击 **View public key**
4. 复制密钥（去除换行）填入 manifest.json 的 `key` 字段

---

## 四、清理调试代码

### 4.1 移除调试日志

在部署前移除以下文件中的调试代码：

- `popup/popup.js` - 移除 console.log 调试语句
- `shared/js/db.js` - 移除调试日志
- `pages/settings/script.js` - 移除调试日志
- 其他页面脚本中的调试语句

### 4.2 检查代码

确认以下文件没有敏感信息泄露：
- API 密钥（如有）
- 测试用的占位符
- 临时注释

---

## 五、测试清单

### 5.1 功能测试

| 功能 | 测试项 | 状态 |
|------|--------|------|
| Popup | 点击设置按钮跳转 | ☐ |
| Popup | 点击打开完整页面跳转 | ☐ |
| Focus 页面 | 加载 IndexedDB 数据 | ☐ |
| Focus 页面 | 添加任务功能 | ☐ |
| Focus 页面 | 完成/删除任务 | ☐ |
| Tasks 页面 | 任务列表显示 | ☐ |
| Calendar 页面 | 周视图显示 | ☐ |
| Settings 页面 | 初始化向导 | ☐ |
| Settings 页面 | 保存设置 | ☐ |
| Settings 页面 | 本地 JSON 导入/导出 | ☐ |
| Settings 页面 | 本地 `.ics` 文件导入 | ☐ |
| Google 授权 | OAuth 登录流程（future only; not current MVP; do not execute for current stage） | N/A |
| 同步功能 | 数据同步（future only; current `sync.js` is a local-first stub） | N/A |

### 5.2 兼容性测试

- [ ] Chrome 最新版
- [ ] Chrome 备用版
- [ ] Edge 浏览器（基于 Chromium）

---

## 六、发布到 Chrome Web Store

### 6.1 上传流程

1. 访问 [Chrome 开发者后台](https://chrome.google.com/webstore/developer/dashboard)
2. 点击 **添加新商品**
3. 上传扩展的 `.zip` 包（打包时选择创建 ZIP）
4. 填写商店信息：
   - 名称：TimeWhere
   - 描述：个人时间管理与任务规划系统
   - 截图：至少 1 张（1280x800 或 640x400）
   - 图标：128x128 PNG
5. 提交审核

### 6.2 审核注意事项

- 确保没有违规内容
- 提供有效的隐私政策链接（如收集数据）
- 描述清晰的功能说明

---

## 七、上线后配置

### 7.1 更新客户端 ID（可选）

如果上线后发现 OAuth 配置需要调整：
1. 在 Google Cloud Console 更新客户端设置
2. 重新打包扩展
3. 发布更新版本

### 7.2 监控与维护

- 定期查看 Chrome 开发者后台的统计数据
- 收集用户反馈
- 及时发布 bug 修复版本

---

## 八、常见问题

### Q1: OAuth 客户端创建时没有填写重定向 URI 选项？
A: 选择 **Chrome Extension** 类型后，不需要填写重定向 URI。Google 会通过扩展 ID 自动识别。

### Q2: `chrome.runtime.getURL()` 返回 file:// 格式？
A: 确保 manifest.json 中已添加 `key` 字段，并且扩展是通过"加载已解压的扩展程序"方式加载的（而非直接打开 HTML 文件）。

### Q3: 扩展发布后需要更新？
A: 每次更新需要：
1. 修改 version 字段（manifest.json）
2. 重新打包
3. 在开发者后台上传新版本

---

## 九、文件清单

部署时需要包含的文件：

```
extension/
├── manifest.json          # 扩展配置（Google data sync uses optional OAuth）
├── background.js          # Service Worker
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── shared/
│   ├── js/
│   │   ├── dexie.js      # IndexedDB 库
│   │   ├── db.js         # 数据库层
│   │   ├── sync.js       # 同步引擎（如已实现）
│   │   └── icons.js      # 图标库
│   ├── styles/
│   └── images/
└── pages/
    ├── focus/
    ├── tasks/
    ├── calendar/
    └── settings/
```

---

*文档版本：v1.0*
*更新时间：2026-04-02*
