# TimeWhere 设计文档 v2.0

**项目名称**: TimeWhere - 个人时间管理与任务规划系统  
**版本**: v2.3  
**日期**: 2026-04-14  
**状态**: 开发中（MVP 阶段）

---

## 概述

TimeWhere 是一款面向 IB 学生的时间管理与任务规划工具，采用 **Chrome Extension + 本地优先** 架构，帮助用户高效管理学习任务和习惯。

### 核心理念

- **自动调度 + 用户自主**: 系统按规则排序并建议任务执行顺序，用户保有最终决定权
- **本地优先**: 数据存储在本地 IndexedDB，同步到云端作为备份
- **聚焦当下**: 时间维度层层展开（当下 → 今日/明日 → 本周 → 外部），减少决策负担

---

## 第一部分：核心概念体系

### 1.1 五大核心实体

| 实体 | 层级 | 定义 | 存储表 |
|------|------|------|--------|
| **事件 Event** | Layer 0 | 日历事件（课表/手动创建/容器 override），`source` 字段区分来源 | `events` |
| **时间容器 Time Container** | Layer 1 | 用户定义的周期性时间段（学习/自由/睡前），支持多种重复规则 | `containers` |
| **任务 Task** | Layer 2 | 有产出、截止时间的可执行待办 | `tasks` |
| **习惯 Habit** | Layer 2 | 长期重复的轻量型待办，无刚性截止 | `habits` |
| **提醒 Reminder** | 辅助层 | 触发提示（待实现） | — |

### 1.2 三层架构

```
┌─────────────────────────────────────────────────────┐
│ Layer 0：日程（不可侵占）                            │
│ 上课、KAP 等外部固定事件                             │
├─────────────────────────────────────────────────────┤
│ Layer 1：时间容器（用户手动配置）                    │
│ 学习时间、自由时间、睡前时间                         │
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
| 事件 vs 容器 | 事件不可替换，容器可配置 | 事件内容固定不可变 |

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
  start_date?: string;           // 计划日期 (YYYY-MM-DD)，"哪天做"，由 Arrange 或用户设定
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
| `start_date` | 计划日期（哪天做） | Arrange / 用户手动 / 延后操作 | 构建当日任务池：`start_date <= today` |
| `due_date` | 截止日期 | 用户创建时填写 | 排序权重：overdue 优先、越近越前 |
| `schedule_time` | 定时时间 | 用户指定 | 在所属容器内获得最高优先级 |
| `duration` | 预计耗时 | 用户填写，默认 45min | 容器容量计算 |

**定时任务 vs 定日任务**：
- 有 `schedule_time`：定时任务，在对应容器内排最前；错过时间后降为普通任务
- 无 `schedule_time`：定日任务，进入当日任务池，由 Daily Settle 按优先级排序

### 2.2 TimeContainer 模型

```typescript
interface TimeContainer {
  id: number;                   // auto-increment
  name: string;
  color: string;                // #HEX
  time_start: string;           // HH:MM
  time_end: string;             // HH:MM

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

**默认容器配置**（新用户自动创建）：

| 容器 | 时间 | repeat | layer | 用途 |
|------|------|--------|-------|------|
| 自由时间 A | 15:30–18:30 | daily | 2 | 放学后，接收溢出任务（先向前） |
| 学习时间 | 18:30–21:30 | weekday | 1 | 主力学习时段 |
| 自由时间 B | 21:30–22:30 | daily | 2 | 晚间，接收溢出任务（后向后） |

### 2.3 Event 模型

```typescript
interface Event {
  id: number;
  title: string;
  date: string;                 // YYYY-MM-DD
  time_start: string | null;    // HH:MM，null 表示全天
  time_end: string | null;

  color: string;
  description?: string;

  source: 'manual'              // 用户手动创建
        | 'timetable'           // ICS 导入
        | 'container_override'  // 替代容器当天显示
        | 'container_skip';     // 隐藏容器当天

  container_id?: number;        // override/skip 关联容器
  created_at: string;
  updated_at: string;
}
```

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

数据存储在 IndexedDB `TimeWhere` 数据库（v3），通过 `TimeWhereDB` 对象统一访问（`extension/shared/js/db.js`）：

```
tables: settings | tasks | containers | habits | events | sync_log
```

所有页面均可通过 `window.TimeWhereDB` 访问，支持双击 HTML 文件独立调试。

### 3.2 Google 同步

| 方向 | 触发 | 说明 |
|------|------|------|
| Google → 本地 | 首次启动 / 初始化 | 导入 Google Tasks 和 Calendar |
| 本地 → Google | 操作时 / 定时 | 同步任务到 Tasks，容器到 Calendar |

### 3.3 同步策略

```
用户操作 → 本地存储 → 标记 pending_changes
                    ↓
            定时检查 (每 5 分钟)
                    ↓
            推送到 Google Tasks/Calendar
                    ↓
            标记已同步
```

---

## 第四部分：调度机制

调度系统分两层：**Arrange**（日期级分配）和 **Daily Settle**（当日实时调度）。

```
未分配任务 ──Arrange──→ 分配到某一天（start_date）
                              ↓
当日任务池 ──Daily Settle──→ 分配到容器 → 建立执行序列
                              ↓
当下任务 ────投影────→ 当前容器的任务序列 → 用户执行
```

### 4.1 Arrange — 任务日期分配（后续迭代）

**解决**：一个未确定日期的任务放到哪一天。

**机制**：基于课表逐次推进
- Plan 新增 `subject` 属性（可选），传递到 Task
- 有 subject 的任务 → 查课表（events 表 `source='timetable'`）找下一个该学科的上课日
- 将 `start_date` 设为有课当天
- 当天未完成 → 下次 Arrange 推进到再下一个上课日
- 无 subject 的任务不参与课表推进

**触发**：可自动可手动。MVP 阶段暂不实现。

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
    (t.start_date == null || t.start_date <= today) &&
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

> 排序主键是 **priority**。未来会设计"截止日逼近时自动提升 priority"的机制。

#### 4.2.3 容器分配（一次排完当日所有容器）

**Step 1 — 主分配：填充 Layer 1（学习时间）**
- 按排序顺序逐个放入学习容器
- 定时任务（schedule_time 在容器时间范围内）最先放入
- 每放一个任务，累加 duration
- 当累计 duration ≥ 容器容量 → 剩余任务需溢出

**Step 2 — 溢出分配：先向前，再向后**
- 溢出任务先分配到**时间更早的 Layer 2 容器**（如放学后自由时间 A）
- 自由时间 A 满后，分配到**时间更晚的 Layer 2 容器**（如晚间自由时间 B）
- 设计理念：**"能早做就早做"**

**Step 3 — 超容量处理**
- 任务 duration > 容器剩余容量但容器为空：仍放入，标注"预计超时"
- 所有容器都满：任务仍在池中，标注"无可用时段"

```
容器容量 = time_end - time_start（分钟）
已占用   = 已分配任务 duration 之和
能放下？ = 已占用 + 任务.duration ≤ 容量 || 已占用 === 0
```

### 4.3 当下任务 — UI 投影

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
- 仅展示、提醒、记录完成状态
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
│   └── settings/              # Settings (待实现)
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
        └── sync.js            # Google Sync Engine (stub)
```

### 5.2 模块功能

| 模块 | 功能 | 优先级 |
|------|------|--------|
| **Focus Dashboard** | 当下任务展示、番茄钟、Up Next | P1 |
| **Task Board** | 任务 CRUD、看板视图 | P1 |
| **Container Config** | 时间容器配置 | P1 |
| **Settings** | 初始化、Google 授权、偏好设置 | P1 |
| **Google Sync** | 数据同步（Tasks + Calendar） | P2 |
| **Reminder** | 提醒通知 | P3 |

---

## 第六部分：实现计划

### Phase 1: 基础框架 ✅

- [x] Extension 脚手架 (manifest.json, background.js)
- [x] 本地存储层 (db.js via Dexie.js, v4 schema)
- [x] 基础 UI 框架 + 共享样式

### Phase 2: UI 模块（进行中）

- [x] Calendar — 周视图 + 月视图 + 容器/事件 CRUD + ICS 导入
- [x] Task Board — Plan/Bucket/Task CRUD, My Day / My Tasks / Plan 视图
- [x] Focus Dashboard — 5 列看板布局 + Daily Settle 核心调度
- [ ] Settings — 初始化向导 + 偏好设置
- [ ] Popup — 快速操作入口

### Phase 3: 调度强化

- [ ] Arrange 课表推进（需 Plan.subject + ICS 课表数据）
- [ ] 延后 1 小时（需 deferred_until 字段 + 分钟级时间计算）
- [ ] 容器 defense/squeezing 规则
- [ ] 截止日逼近 → 自动调整 priority

### Phase 4: Google Sync

- [ ] OAuth2 授权
- [ ] 初始化导入 (Google → 本地)
- [ ] 定时同步 (本地 → Google)

---

## 第七部分：待实现功能（Backlog）

### P1（近期）

- Pomodoro 计时器实际逻辑（Focus Dashboard 集成）
- Arrange 课表推进
- Settings 页面

### P2

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
- Google Sync 实际对接（OAuth2 + Tasks/Calendar API）
- ManageBac ICS 订阅链接自动导入

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

**最后更新**: 2026-04-14
**状态**: MVP 开发中
