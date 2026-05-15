# TimeWhere 架构设计

**版本**: v2.3  
**日期**: 2026-04-14  
**状态**: Internal MVP accepted; baseline stabilized for local-first MVP. Not public release ready.

> Current baseline note (2026-05-15): TimeWhere is a local-first Chrome extension MVP. Task Date Arrange is approved for current baseline stabilization with preview / user-confirmed writes only. ManageBac ICS import is an extension-side source import using a saved link plus manual/user-confirmed sync; it is not a cloud sync backend. D-019 approves the next Google data sync planning direction: optional Google account configuration for durable cloud storage and cross-device sync, while all core features remain fully usable without Google. Google sync implementation, background alarm automation, reminder notifications, Chrome Web Store submission, and public release still require explicit Product Owner approval for the concrete work package.

---

## 1. 技术选型

| 组件 | 技术 | 说明 |
|------|------|------|
| 客户端 | Chrome Extension (Manifest V3) | 主要运行环境 |
| 存储 | **IndexedDB + Dexie.js** | 本地数据存储（统一存储） |
| 后端同步 | None in current runtime baseline | `sync.js` remains a local-first stub; D-019 plans optional Google Drive `appDataFolder` sync as the next work package |
| 通知 | UI/icon only in current MVP | System reminder notifications are future scope |
| 图标 | SVG 内联 | 完全离线支持 |
| 字体/图标 | Local CSS/assets only | Extension pages do not load Google Fonts remotely |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Focus   │  │  Tasks   │  │Calendar  │  │Settings  │  │
│  │Dashboard │  │  Board   │  │          │  │          │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │              │         │
│  ┌────▼──────────────▼──────────────▼──────────────▼────┐  │
│  │                   Storage Layer                       │  │
│  │              (IndexedDB + Dexie.js)                  │  │
│  │   settings | tasks | containers | habits | sync_log │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           │                                │
│  ┌────────────────────────▼────────────────────────────┐  │
│  │     Future Google Data Sync Boundary (D-019 planned) │  │
│  │   - Optional Drive appDataFolder replica, not login  │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 存储设计

### 3.1 数据库结构

```javascript
// 使用 Dexie.js 封装 IndexedDB — 当前 v4
const db = new Dexie('TimeWhere');

db.version(2).stores({
  settings: 'key',
  tasks: '++id, subject, bucket, deadline, status, createdAt, priority, completed_at',
  containers: '++id, name, repeat, enabled',
  habits: '++id, frequency, status_today',
  sync_log: '++id, type, action, timestamp, entity_id',
  events: '++id, title, date, time_start, time_end, container_id, created_at'
});

db.version(3).stores({
  events: '++id, title, date, time_start, time_end, container_id, created_at, source'
});

db.version(4).stores({
  plans:   '++id, name, created_at',
  buckets: '++id, plan_id, name, sort_order',
  labels:  '++id, plan_id, color, name',
  tasks:   '++id, plan_id, bucket_id, due_date, progress, priority, created_at, updated_at'
});
```

共 8 个表：`settings`, `plans`, `buckets`, `labels`, `tasks`, `containers`, `habits`, `events`, `sync_log`

### 3.2 数据容量

| 数据类型 | 预估数量 | 存储方案 |
|----------|----------|----------|
| Tasks | 5000-10000 | IndexedDB (~20MB) |
| Containers | 10-20 | IndexedDB |
| Habits | 20-50 | IndexedDB |
| Settings | <1KB | IndexedDB |

### 3.3 本地调试支持

- **直接双击 HTML 文件即可调试**
- 无需环境检测，所有数据存储在 IndexedDB
- 页面独立运行时自动创建 `TimeWhere` 数据库

---

## 4. 目录结构

```
extension/
├── manifest.json              # 扩展配置 (MV3)
├── background.js              # Service Worker
│
├── popup/                     # 弹出窗口
│   ├── popup.html
│   └── popup.js
│
├── pages/                     # 独立页面（每个模块独立目录）
│   ├── focus/                 # Focus Dashboard（Daily Settle 核心）
│   │   ├── focus.html
│   │   ├── script.js          # dailySettle() + 4 列数据加载
│   │   └── styles.css
│   ├── tasks/                 # Task Board
│   │   ├── tasks.html
│   │   ├── script.js          # Plan/Bucket/Task CRUD
│   │   ├── state.js           # 状态管理 (viewMode, filters)
│   │   └── styles.css
│   ├── calendar/              # Calendar
│   │   ├── calendar.html
│   │   ├── script.js          # 周/月视图 + 容器/事件 CRUD
│   │   └── styles.css
│   └── settings/              # Settings (minimal local-first MVP)
│       └── settings.html
│
├── shared/                    # 共享资源
│   ├── styles/
│   │   ├── fonts.css          # 本地字体引用
│   │   └── icons.css          # Material Symbols
│   ├── images/
│   │   ├── bg.jpg             # 背景图（本地化）
│   │   └── avatar-default.png
│   └── js/
│       ├── dexie.js           # Dexie.js 库（第三方）
│       ├── db.js              # IndexedDB 存储层 (TimeWhereDB)
│       ├── icons.js           # Material Symbols 初始化
│       └── sync.js            # Local-first MVP stub
│
├── _locales/                  # 国际化
│   └── en/
│       └── messages.json
│
└── icons/                     # 扩展图标
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 5. 独立调试架构

### 5.1 调试方式

| 场景 | 方式 |
|------|------|
| **本地开发** | 直接双击 `pages/*.html` |
| **Extension 测试** | 加载 unpacked extension |
| **生产环境** | Not approved for current stage; Chrome Web Store is future release work |

### 5.2 开发工作流

```
1. 双击 pages/focus.html
   ↓
2. IndexedDB 自动创建 'TimeWhere' 数据库
   ↓
3. 页面加载 ../shared/js/db.js
   ↓
4. 所有 CRUD 操作通过 Dexie.js
   ↓
5. 样式/交互独立调试
```

---

## 6. 数据流

### 6.1 首次启动

```
用户首次打开页面
        ↓
    检测 IndexedDB 'TimeWhere'
        ↓
    弹出设置引导（Settings 页面）
        ↓
    写入 IndexedDB
        ↓
    标记 settings.initialized = true
```

### 6.2 日常使用

```
用户操作 (创建/修改/完成任务)
        ↓
    更新 IndexedDB (Dexie.js)
        ↓
    页面刷新/重新加载时从 IndexedDB 读取最新数据
```

---

## 7. 模块设计

### 7.1 Storage Layer (db.js)

```javascript
// shared/js/db.js - IndexedDB + Dexie.js 封装
// 导出为 window.TimeWhereDB 对象（非 class）

const TimeWhereDB = {
  // Plans CRUD (v4)
  getPlans(), getPlanById(id), addPlan(plan), updatePlan(id, data), deletePlan(id),

  // Buckets CRUD (v4)
  getBucketsByPlan(planId), addBucket(bucket), updateBucket(id, data), deleteBucket(id),

  // Labels CRUD (v4)
  getLabelsByPlan(planId), addLabel(label), updateLabel(id, data), deleteLabel(id),

  // Tasks CRUD
  getTasks(filter), getTasksByPlan(planId, filter), getAllTasks(filter),
  getTaskById(id), getInProgressTask(),
  addTask(task), updateTask(id, data), deleteTask(id),
  completeTask(id), startTask(id),
  updateChecklist(taskId, checklist), toggleChecklistItem(taskId, itemId),

  // Containers CRUD
  getContainers(filter), getContainerById(id),
  addContainer(container), updateContainer(id, data), deleteContainer(id),
  toggleContainerEnabled(id),

  // Events CRUD
  getEvents(filter), getEventById(id), getEventsByDateRange(start, end),
  addEvent(event), updateEvent(id, data), deleteEvent(id),

  // Habits CRUD
  getHabits(), addHabit(habit), updateHabit(id, data), completeHabit(id),

  // Settings
  getSetting(key), setSetting(key, value), getSettings(), initDefaultSettings(),

  // Sync Log
  addSyncLog(type, action, data), getPendingSyncLogs(), clearSyncLog(id),

  // Utility
  clearAllData(), getDatabaseInfo()
};
```

**注意**：`updateTask()` 内置双向同步 — `progress` ↔ `status`, `due_date` ↔ `deadline`。

### 7.2 Sync Boundary (D-019 planned; current code stub)

```javascript
// shared/js/sync.js
// Current MVP behavior: return out_of_scope_for_mvp.
// D-019 approves optional Google data sync planning.
// Do not enable implementation until a concrete Build&Test package is approved.
```

Current runtime behavior remains local-first:

- IndexedDB is the runtime source of truth.
- `sync.js` is still a compatibility stub in the current code baseline.
- ManageBac ICS import uses an extension-side saved-link fetch/import path; it is not a cloud sync backend.

D-019 defines the next Google data sync direction:

- Google account configuration is optional and must not become a product login requirement.
- Google sync is only for durable cloud storage and cross-device data synchronization.
- The first cloud storage target is Google Drive `appDataFolder`.
- First implementation should start with manual bidirectional sync and conflict confirmation.
- ManageBac ICS link must be included in synced settings because Product Owner requires cross-device retention.
- Google email/account display is deferred to a later implementation step.
- Google Calendar / Google Tasks integration is not part of the first Google data sync stage.

---

## 8. Manifest 配置

```json
{
  "manifest_version": 3,
  "name": "TimeWhere",
  "version": "0.1.0",
  "description": "个人时间管理与任务规划系统",

  "permissions": [
    "storage",
    "tabs",
    "unlimitedStorage"
  ],

  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },

  "background": {
    "service_worker": "background.js"
  },

  "web_accessible_resources": [
    {
      "resources": ["pages/*.html", "shared/**/*"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

---

## 9. 关键设计决策

### 9.1 为什么选择 IndexedDB？

| 考虑因素 | 说明 |
|----------|------|
| 数据量 | 5000-10000 个任务，约 20MB，超出 localStorage 限制 |
| 性能 | 异步 API，不阻塞主线程 |
| 查询能力 | 支持索引，可快速查询特定日期/学科的任务 |
| 统一存储 | 配置 + 数据统一存储，简化架构 |

### 9.2 为什么使用 Dexie.js？

| 考虑因素 | 说明 |
|----------|------|
| API 简化 | 原生 IndexedDB API 复杂，Dexie 提供简洁的 Promise API |
| 代码量 | 减少手写 IndexedDB 代码量 |
| 维护性 | 社区活跃，文档完善 |

### 9.3 离线优先策略

| 资源 | 处理方式 |
|------|----------|
| 背景图 | 内嵌到 `images/bg.jpg` |
| Fonts / icons | Local CSS/assets; no remote Google Fonts dependency in extension pages |
| Icons | 全部替换为 SVG 内联 |
| 用户头像 | 使用本地默认头像 |

---

## 10. 依赖关系

```
pages/*.html
    ↓
../shared/js/db.js (Dexie.js)
    ↓
IndexedDB 'TimeWhere'

Future sync work, if approved, must be re-specified before implementation.
```

---

## 11. 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v2.3 | 2026-04-14 | 目录结构重组（每模块独立目录）；DB v4 schema（Plans/Buckets/Labels）；Storage Layer API 更新 |
| v2.1 | 2026-04-02 | 存储方案改为 IndexedDB + Dexie.js；统一存储；增加独立调试支持 |
| v2.0 | 2026-04-02 | 初始版本 |

---

**最后更新**: 2026-05-15 (baseline stabilization docs sync)
