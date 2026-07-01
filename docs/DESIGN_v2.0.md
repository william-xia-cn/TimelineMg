# TimeWhere 设计文档 v2.0

**项目名称**: TimeWhere - 个人时间管理与任务规划系统  
**版本**: v2.3  
**日期**: 2026-04-14  
**状态**: Internal MVP accepted; baseline stabilized for local-first MVP. Not public release ready.

> Current baseline note (2026-05-16): Local-first MVP is accepted. Task Date Arrange is approved for current baseline stabilization with preview / user-confirmed writes only. D-019/D-020 approve optional Google Drive `appDataFolder` data sync v1. D-021 approves Chrome system reminder notifications for local tasks only. Background alarm automation outside task reminders, Chrome Web Store submission, and public release remain future/out-of-current-scope unless Product Owner explicitly approves them.

---

## 概述

TimeWhere 是一款面向 IB 学生的时间管理与任务规划工具，采用 **Chrome Extension + 本地优先** 架构，帮助用户高效管理学习任务和习惯。

### 核心理念

- **自动调度 + 用户自主**: 系统按规则排序并建议任务执行顺序，用户保有最终决定权
- **本地优先**: 当前运行基线数据存储在本地 IndexedDB。Google 数据同步是可选跨终端复制能力，本地功能不能依赖 Google 账号。
- **聚焦当下**: 时间维度层层展开（当下 → 今日/明日 → 本周 → 外部），减少决策负担

---

## 第一部分：核心概念体系

### 1.1 五大核心实体

| 实体 | 层级 | 定义 | 存储表 |
|------|------|------|--------|
| **事件 Event** | Layer 0 | 日程事件（课表/手动创建/容器 override），可一次性或重复发生，`source` 字段区分来源 | `events` |
| **时间容器 Time Container** | Layer 1 | 用户定义的周期性时间段（学习/自由/睡前），支持多种重复规则 | `containers` |
| **任务 Task** | Layer 2 | 有产出、截止时间的可执行待办 | `tasks` |
| **习惯 Habit** | Layer 2 | 长期重复的轻量型待办，无刚性截止 | `habits` |
| **提醒 Reminder** | 辅助层 | Chrome system notification for local task reminders | `chrome.storage.local` 去重状态 |

### 1.2 三层架构

```
┌─────────────────────────────────────────────────────┐
│ Layer 0：日程（不可侵占）                            │
│ 上课、KAP 等外部固定事件                             │
├─────────────────────────────────────────────────────┤
│ Layer 1：时间容器（用户手动配置）                    │
│ 学习时间、自由时间 A/B                               │
├─────────────────────────────────────────────────────┤
│ Layer 2：任务/习惯                                   │
│ 普通任务、Habit Task                                 │
└─────────────────────────────────────────────────────┘
```

### 1.3 边界定义

| 对比组 | 差异点 | 判断原则 |
|--------|--------|----------|
| 习惯 vs 任务 | 习惯无计量产出目标 | 有产出目标 → 任务 |
| 容器 vs 任务 | 容器是时段，任务是待办 | 容器内填充任务 |
| 日程事件 vs 容器 | 日程事件是 Calendar 上的日程项，可一次性或重复发生；容器是可承载任务的时间结构 | 二者都可有重复规则，但只有容器参与任务容量/承载计算 |

---

## 第二部分：数据模型

### 2.1 Task 模型

```typescript
interface Task {
  id: string;                    // UUID
  title: string;                 // 任务标题
  
  // Planner 属性（v4）
  plan_id: number;               // 所属 Plan
  bucket_id?: number;            // 所属 Bucket
  labels: number[];              // 关联 Label IDs
  notes: string;                 // 笔记/描述
  checklist: ChecklistItem[];    // 子任务清单
  
  // 时间属性 — 调度核心
  start_date?: string;           // 用户/来源配置开始日期 (YYYY-MM-DD)
  arranged_date?: string;        // Task Arrange 本地安排日期 (YYYY-MM-DD)，本地派生字段
  due_date?: string;             // 截止日期 (YYYY-MM-DD)，"最晚什么时候完成"
  schedule_time?: string;        // 指定时间 (HH:MM)，有则为定时任务
  duration: number;              // 预计耗时（分钟），默认 45
  
  // 组织属性
  subject?: string;              // 学科（继承自 Plan.subject）
  
  // 状态
  priority: 'urgent' | 'important' | 'medium' | 'low';  // 优先级
  progress: 'not_started' | 'in_progress' | 'completed'; // 执行状态
  completed_at?: string;         // 完成时间 ISO 8601
  
  // 元数据
  created_at: string;
  updated_at: string;
}
```

**时间属性说明**：

| 字段 | 含义 | 由谁设置 | Daily Settle 用途 |
|------|------|---------|-------------------|
| `start_date` | 用户/来源配置开始日期 | 创建、导入或用户编辑；手动任务默认等于 `due_date`，ManageBac 默认 `max(today, due_date - 14 days)` |
| `arranged_date` | Task Arrange 本地安排日期，本地派生字段 | Daily Settle 优先使用；不作为普通云端同步事实字段 |
| `due_date` | 截止日期，来源/用户事实字段 | 截止、逾期、priority 升级和排序依据 |
| `schedule_time` | 定时时间 | 用户指定 | 在所属容器内获得最高优先级 |
| `duration` | 预计耗时 | 用户填写，默认 45min | 容器容量计算 |

**定时任务 vs 定日任务**：
- 有 `schedule_time`：定时任务，在对应容器内排最前；错过时间后降为普通任务
- 无 `schedule_time`：定日任务，进入当日任务池，由 Daily Settle 按优先级排序

### 2.2 TimeContainer 模型

```typescript
interface TimeContainer {
  id: string;                   // UUID / generated string id
  name: string;
  color: string;                // #HEX
  time_start: string;           // 每天的开始时间 HH:MM
  time_end: string;             // 每天的结束时间 HH:MM
  active_start_date?: string | null; // 容器重复生效开始日期 YYYY-MM-DD；空表示无下界
  active_end_date?: string | null;   // 容器重复生效结束日期 YYYY-MM-DD；空表示长期

  // 层级 — Daily Settle 调度核心
  layer: 1 | 2;                 // 1=学习时间(主力), 2=自由时间(溢出接收)

  // 重复规则（Google Calendar 风格）
  repeat: 'none' | 'daily' | 'weekday' | 'weekend' | 'weekly'
        | 'monthly_nth' | 'yearly' | 'custom' | 'once';
  repeat_days?: number[];       // weekly/custom: [0-6]
  monthly_week?: number;        // monthly_nth: 第几个 (1-4)
  monthly_dow?: number;         // monthly_nth: 周几 (0=周日)
  yearly_month?: number;        // yearly: 月份
  yearly_dom?: number;          // yearly: 日期
  once_date?: string;           // once: YYYY-MM-DD

  // 承载规则
  task_types: string[];
  subjects?: string[];
  defense: 'hard' | 'soft';    // 防御等级（MVP 未启用）
  squeezing: 'none' | 'p1_only' | 'p1_p2'; // 挤压规则（MVP 未启用）

  // 状态
  enabled: boolean;
  created_at: string;
  updated_at: string;
}
```

重复容器的 active range 先于 repeat 规则判断，边界日期包含在内；旧容器字段为空时保持无边界。该范围只控制容器在哪些自然日期出现，不改变每天的 `time_start` / `time_end`。

**默认容器配置**（新用户自动创建）：

| 容器 | 时间 | repeat | layer | 用途 |
|------|------|--------|-------|------|
| 自由时间 A | 15:30–18:30 | daily | 2 | 放学后，接收溢出任务（先向前） |
| 学习时间 | 18:30–21:30 | weekday | 1 | 主力学习时段 |
| 自由时间 B | 21:30–22:30 | daily | 2 | 晚间，接收溢出任务（后向后） |

### 2.3 Event 模型

```typescript
interface Event {
  id: string;
  title: string;
  date: string;                 // 起始日期 YYYY-MM-DD
  time_start: string | null;    // HH:MM，null 表示全天
  time_end: string | null;
  active_start_date?: string | null; // 日程事件重复生效开始日期；空表示无下界
  active_end_date?: string | null;   // 日程事件重复生效结束日期；空表示长期

  repeat: 'none' | 'daily' | 'weekday' | 'weekend' | 'weekly'
        | 'monthly_nth' | 'yearly' | 'custom' | 'once';
  repeat_days?: number[];
  monthly_week?: number;
  monthly_dow?: number;
  yearly_month?: number;
  yearly_dom?: number;
  once_date?: string;

  color: string;
  description?: string;

  source: 'manual'              // 用户手动创建
        | 'timetable'           // ICS 导入
        | 'container_override'  // 替代容器当天显示
        | 'container_skip';     // 隐藏容器当天

  container_id?: string;        // override/skip 关联容器
  created_at: string;
  updated_at: string;
}
```

日程事件的 active range 先于 repeat/date 规则判断，边界日期包含在内；旧事件字段为空时保持无边界。
epeat='none' 仍只在 date 当天显示，container_override / container_skip 仍按 date 精确匹配。

### 2.4 Habit 模型

```typescript
interface Habit {
  id: string;
  title: string;                // 习惯名称
  
  // 频率
  frequency: 'daily' | 'weekly' | 'custom';
  target_count: number;         // 每周期目标次数
  repeat_days?: number[];        // 自定义周几
  
  // 状态
  completed_count: number;      // 当前周期完成次数
  streak: number;               // 连续完成天数
  status_today: 'pending' | 'done' | 'skipped';
  
  // 关联
  container_id?: string;       // 关联容器
  
  created_at: string;
  updated_at: string;
}
```

---

## 第三部分：存储架构

### 3.1 本地存储（IndexedDB via Dexie.js）

数据存储在 IndexedDB `TimeWhere` 数据库（当前 Dexie v4 schema），通过 `TimeWhereDB` 对象统一访问（`extension/shared/js/db.js`）：

```
tables: settings | plans | buckets | labels | tasks | containers | habits | events | sync_log
```

所有页面均可通过 `window.TimeWhereDB` 访问，支持双击 HTML 文件独立调试。

### 3.2 当前同步边界

当前 Google 数据同步 v1 使用 `extension/shared/js/google-sync.js` 和 Google Drive `appDataFolder`。`extension/shared/js/sync.js` 仍是旧 Google/Calendar/Tasks 调用兼容 stub，不代表当前数据同步实现。

### 3.3 Google 数据同步 v1（D-019 / D-020）

TimeWhere 是独立 local-first 控件，不依赖 Google 账号即可完整使用全部核心功能。Google 账号配置仅用于数据持久化云端存储和跨终端双向同步，不是产品登录门槛，也不决定本地功能权限。OAuth client ID 只标识 TimeWhere 这个 Chrome Extension 应用；用户授权后，云端副本写入该用户自己的 Google Drive `appDataFolder`，开发者没有服务器端数据托管路径。

设计原则：

- IndexedDB 仍是运行时主数据库；所有页面继续读写本地 DB。
- Google 云端数据是同步副本，不是在线数据库。
- 未连接、离线、授权失败或 token 失效时，本地功能继续工作。
- UI 命名为 `Google 数据同步`，避免表达成“登录后才能使用”。
- 第一版云端存储使用 Google Drive `appDataFolder`。
- `appDataFolder` 属于当前授权用户自己的 Google Drive，而不是开发者账号。
- 第一版同步是自动双向同步：打开主要页面时节流检查，本地保存后 debounce 检查，不引入 background alarm。
- 云端格式为 `timewhere-sync-v1.json`，包含 `entities`、`tombstones`、`devices`、`manifest`。
- 删除使用 tombstone，避免旧设备复活已删除数据。
- 冲突使用非阻断确认：`使用本地` / `使用云端` / `跳过`，不得静默覆盖。
- `上传本设备数据` 与 `从 Google 恢复` 是高级危险动作，必须二次确认。
- ManageBac ICS link 需要随数据同步，因为 Product Owner 明确要求跨终端保留该配置。
- Google email / account display 后续实现，不作为第一版同步能力的必要条件。

不属于 Google 数据同步第一阶段：

- Google Calendar / Google Tasks 功能集成。
- 多用户共享或服务器端账号系统。
- Chrome Web Store / public release。
- 后台 alarm 自动同步。

---

## 第四部分：调度机制

调度系统设计分两层：**Task Date Arrange**（日期级分配，当前 baseline stabilization scope）和 **Daily Settle**（当日实时调度，当前已实现）。

```
未分配任务 ──Arrange──→ 分配到某一天（start_date）
                              ↓
当日任务池 ──Daily Settle──→ 分配到容器 → 建立执行序列
                              ↓
当前任务 ────投影────→ 当前容器的任务序列 → 用户执行
```

### 4.1 Task Date Arrange — 任务日期分配

**解决**：一个未确定日期的任务放到哪一天。

**字段分工**：
- `due_date`：截止日期，只用于截止、逾期和优先级升级判断。
- `start_date`：计划日期，决定任务进入哪一天的 Daily Settle。

**默认 `start_date`**：
- ManageBac 来源任务：`max(today, due_date - 14 days)`。
- 手动创建普通任务：未填写 `start_date` 时默认等于 `due_date`。

**优先级升级**：
- 距离截止日 `<= 3 天`：可升级到 `important`。
- 距离截止日 `<= 1 天` 或已逾期：可升级到 `urgent`。
- Arrange 只升级 priority，不降级用户已经设置得更高的 priority。

**课表推进机制**：
- 有 `subject` 的任务 → 查课表（events 表 `source='timetable'`）找下一个该学科的上课日。
- 将 `start_date` 设为有课当天。
- 当天未完成 → 下次 Arrange 推进到再下一个上课日。
- 无 `subject` 的任务不参与课表推进。
- `important` / `urgent` 任务不再考虑学科，当天就排。
- 找不到匹配上课日时，urgent 或逾期任务排今天；其他任务保留当前 `start_date`，不强行猜日期。

**触发与写入边界**：
- 当前不引入后台 alarm；6 小时机制只在 Dashboard / Focus 入口检测。
- Popup 本身、Calendar 页面打开、Planner Task Board 页面打开、Planner `my ManageBac` 视图打开，都不得触发 6 小时自动检查。
- Dashboard 检测同时执行 Task Date Arrange preview 和 ManageBac 新事件 preview；如果存在待确认项，必须进入统一的“任务调整与 ManageBac 同步确认”页面。
- 确认页展示 Arrange task 列表和新增 ManageBac task 列表；用户确认选中项后才写入，或选择全部跳过完成本轮检查。
- Planner `my ManageBac` 的手动同步按钮保留，但它只执行 ManageBac-only preview，并打开同一个确认页；不顺带执行 Arrange。
- 用户取消 / 跳过时不得写入未选任务，也不得把未完成 pending 伪装成已导入。

### 4.2 Daily Settle — 当日实时调度（已实现）

**解决**：当天和当下做什么。为当日所有容器一次性建立有序任务序列。

**性质**：
- **无状态纯函数**：每次从零计算，不依赖上一次结果
- **触发时机**：任务状态变更时 + 每 10 分钟自动执行
- **输入**：当日任务池 + 当日容器列表 + 当前时间
- **输出**：每个容器的有序任务列表 + 无容器时段的完整池排序

#### 4.2.1 当日任务池

```
taskPool = tasks.filter(t =>
    ((t.arranged_date || t.start_date) == null || (t.arranged_date || t.start_date) <= today) &&
    t.progress !== 'completed'
)
```

包含：计划今天做的 + 所有 overdue 的 + 未分配日期的。

#### 4.2.2 排序规则

优先级从高到低：
1. **定时任务**（有 `schedule_time` 且未过时间）→ 最高
2. **priority**：urgent > important > medium > low
3. **同 priority**：overdue（`due_date < today`）排在前面
4. **同 priority + 同 overdue 状态**：`due_date` 越近越前
5. **定时任务已过时间**：降为普通任务，按 priority 参与排序

> 排序主键是 **priority**。Task Date Arrange 可根据截止日做 priority 升级，但只升级不降级。

#### 4.2.3 容器分配（一次排完当日所有容器）

**Step 1 — 主分配：填充 Layer 1（学习时间）**
- 按排序顺序逐个放入学习容器
- 定时任务（schedule_time 在容器时间范围内）最先放入
- 每放一个任务，累加 duration
- 当累计 duration ≥ 容器容量 → 剩余任务需溢出

**Step 2 — 溢出分配：先向前，再向后**
- 溢出任务先分配到**时间更早的 Layer 2 容器**（如放学后自由时间 A）
- 自由时间 A 满后，分配到**时间更晚的 Layer 2 容器**（如晚间自由时间 B）
- Layer 2 是所有溢出任务的接收层，不只接收 urgent 或 overdue 任务
- 设计理念：**"能早做就早做"**

**Step 3 — 超容量处理**
- 任务 duration > 容器剩余容量但容器为空：仍放入，标注"预计超时"
- 所有容器都满：任务仍在池中，标注"无可用时段"

```
容器容量 = time_end - time_start（分钟）
已占用   = 已分配任务 duration 之和
能放下？ = 已占用 + 任务.duration ≤ 容量 || 已占用 === 0
```

### 4.3 当前任务 — UI 投影

Daily Settle 在当前时间点的投影，是 Focus Dashboard 第一列的数据来源。

- **当前时间在某容器内** → 显示该容器的任务序列
- **当前时间不在任何容器内** → 显示完整当日池（按排序），用户可自主选择
- 第一个任务默认展开（详情 + 操作），其他折叠
- **建议顺序，不强制** — 用户可展开任何任务执行

**操作**：

| 操作 | 行为 | 触发重算 |
|------|------|---------|
| 完成 | `progress='completed'`, `completed_at=now` | ✓ |
| 开始 | `progress='in_progress'` | ✓ |
| 暂停 | `progress='not_started'` | ✓ |
| 延后 1/3/7 天 | `start_date = today + N` → 从当日池移除 | ✓ |

### 4.4 Habit 规则

- **不参与** Arrange / Daily Settle 调度
- **不参与** 时间容器分配
- 当前仅展示并记录完成状态；系统提醒按 D-021 仅覆盖本地任务通知
- 未来作为独立任务类型处理

---

## 第五部分：模块结构

### 5.1 Chrome Extension 模块

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
│   ├── focus/                 # Focus Dashboard
│   │   ├── focus.html
│   │   ├── script.js          # Daily Settle + 4 列数据加载
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
└── shared/                    # 共享资源
    ├── styles/
    │   ├── fonts.css
    │   └── icons.css
    ├── images/
    │   ├── bg.jpg
    │   └── avatar-default.png
    └── js/
        ├── dexie.js           # Dexie.js 库
        ├── db.js              # IndexedDB 存储层 (TimeWhereDB)
        ├── icons.js           # Material Symbols
        └── sync.js            # Local-first MVP stub; D-019 Google data sync planned
```

### 5.2 模块功能

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **Focus Dashboard** | 当前任务、今日/明日日程、本周进度、消息流 | P1 |
| **Task Board** | 任务 CRUD、看板视图 | P1 |
| **Container Config** | 时间容器配置 | P1 |
| **Settings** | 初始化向导、本地偏好、容器管理、ICS/JSON 导入导出 | P1 |
| **Google 数据同步** | D-019 / D-020 active optional Drive `appDataFolder` sync v1; `sync.js` remains only a legacy stub | P2+ |
| **Reminder** | D-021 active local task reminder notifications | 当前 baseline stabilization |

---

## 第六部分：实现计划

### Phase 1: 基础框架 ✅

- [x] Extension 脚手架 (manifest.json, background.js)
- [x] 本地存储层 (db.js via Dexie.js, v4 schema)
- [x] 基础 UI 框架 + 共享样式

### Phase 2: UI 模块（Internal MVP baseline）

- [x] Calendar — 周视图 + 月视图 + 容器/事件 CRUD + ICS 导入
- [x] Task Board — Plan/Bucket/Task CRUD, My Day / My Tasks / Plan 视图
- [x] Focus Dashboard — 4 个数据区，桌面比例 `2:2:1:1`，首屏优先显示 `2:2:1`
- [x] Settings — 初始化向导 + 本地偏好 + 容器管理 + ICS/JSON 导入导出
- [x] Popup — 快速操作入口

### Phase 3: 调度强化

- [x] Task Date Arrange 课表推进（preview + 用户确认后写入）
- [ ] 延后 1 小时（需 deferred_until 字段 + 分钟级时间计算）
- [ ] 容器 defense/squeezing 规则
- [x] 截止日逼近 → priority 只升级不降级

### Phase 4: Google 数据同步（D-019 / D-020）

- [x] D-019 / D-020 文档落地：local-first + optional Google data sync。
- [x] Auth setup：Chrome Identity / OAuth token 获取，Settings 显示连接状态。
- [x] Snapshot export/import：定义 canonical JSON，本地导出 / 恢复。
- [x] Drive `appDataFolder` 手动备份 / 恢复基础能力。
- [x] 双向同步 v1：本地与云端 record-level merge，冲突进入确认。
- [x] 自动触发策略：打开主要页面节流检查，保存后 debounce 检查；不做 background alarm。

---

## 第七部分：待实现功能（Backlog）

### P1（近期）

- Pomodoro 计时器实际逻辑（future only；当前 Dashboard 不显示番茄钟）
- Settings 细化：休息/长休息 UI、向导体验、危险操作文案
- Settings Plan 区块：ManageBac 链接同步确认 UI polish

### P2

- Task Date Arrange / ManageBac unified management review UI polish
- 拖拽调整日历事件时间/日期
- 键盘快捷键（N/E/Del/← →）
- ICS 导出
- 容器可见性开关
- 通知/提醒系统
- Habit 非学习型任务

### P3

- Undo / Redo
- 响应式布局
- 日视图
- 多日跨天事件渲染
- 时区支持
- Google 数据同步后续增强（account display、better conflict UX、Google Tasks/Calendar API 另行决策）
- ManageBac background / automatic ICS sync（future only; current follow-up supports saved link configuration, manual sync, and user-confirmed task creation）

---

## 附录：相关文档

| 文档 | 说明 |
|------|------|
| `docs/DATA_MODEL.md` | 完整数据模型（含 v4 schema） |
| `docs/MODULES.md` | 各模块详细功能规格 |
| `docs/ARCHITECTURE.md` | 技术架构与目录结构 |
| `archive/v1.0_google-based/` | 原设计文档 (Apps Script) |
| `archive/ARCHITECTURE_CHANGE_LOG.md` | 架构变更记录 |

---

**最后更新**: 2026-05-15
**状态**: Internal MVP accepted; baseline stabilized for local-first MVP.
