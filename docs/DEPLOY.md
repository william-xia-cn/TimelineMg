# TimeWhere 部署指南

本文档记录 TimeWhere 扩展从本地开发完成到最终发布上线所需补充和完成的工作。

---

## 一、部署前准备

### 1.1 创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目：`TimeWhere`
3. 启用以下 API：
   - Google Tasks API
   - Google Calendar API
   - Google People API (用于获取用户邮箱)

### 1.2 创建 OAuth 2.0 客户端

1. 进入 **APIs & Services** → **Credentials**
2. 点击 **Create Credentials** → **OAuth client ID**
3. 选择 **Chrome Extension** 类型
4. 填写信息：
   - Name: `TimeWhere OAuth`
   - **不要填写重定向 URI**（Chrome 扩展类型自动识别）
5. 保存生成的 `CLIENT_ID`（格式：`[xxx].apps.googleusercontent.com`）

---

## 二、配置 Manifest

### 2.1 添加 OAuth 配置

在 `manifest.json` 中添加：

```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/tasks",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email"
    ]
  }
}
```

### 2.2 添加 key 字段

为确保扩展 ID 固定，需要添加 `key` 字段：

1. 打包扩展（见下文）
2. 在开发者后台获取 public key
3. 添加到 manifest.json：

```json
{
  "key": "YOUR_PUBLIC_KEY_HERE"
}
```

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
| Google 授权 | OAuth 登录流程 | ☐ |
| 同步功能 | 数据同步（如果已实现） | ☐ |

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
├── manifest.json          # 扩展配置（已配置 key 和 OAuth）
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