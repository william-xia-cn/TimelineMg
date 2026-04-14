# TimeWhere 数据模型

**版本**: v2.3  
**日期**: 2026-04-14

---

## 1. 数据模型概览

```
IndexedDB 'TimeWhere' (via Dexie.js) — v4
├── settings       # 配置表 (key-value)
├── plans          # 计划表 (v4+)
├── buckets        # 分类桶 (v4+)
├── labels         # 标签表 (v4+)
├── tasks          # 任务表
├── containers     # 时间容器表
├── habits         # 习惯表
├── events         # 日历事件表
└── sync_log       # 同步日志表
```

### 1.1 数据库配置

```javascript
const db = new Dexie('TimeWhere');

// v2: 基础 schema
db.version(2).stores({
  settings: 'key',
  tasks: '++id, subject, bucket, deadline, status, createdAt, priority, completed_at',
  containers: '++id, name, repeat, enabled',
  habits: '++id, frequency, status_today',
  sync_log: '++id, type, action, timestamp, entity_id',
  events: '++id, title, date, time_start, time_end, container_id, created_at'
});

// v3: events.source 索引
db.version(3).stores({
  events: '++id, title, date, time_start, time_end, container_id, created_at, source'
});

// v4: Planner 架构 — Plans, Buckets, Labels + Task 字段重构
db.version(4).stores({
  plans:   '++id, name, created_at',
  buckets: '++id, plan_id, name, sort_order',
  labels:  '++id, plan_id, color, name',
  tasks:   '++id, plan_id, bucket_id, due_date, progress, priority, created_at, updated_at'
});
// v4 migration: 创建默认 Plan，迁移 bucket→bucket_id，status→progress，deadline→due_date
```

---

## 2. Task 任务

### 2.1 模型定义

```typescript
interface Task {
  // 基础信息
  id: string;                    // UUID v4
  title: string;                 // 任务标题 (必填)
  
  // Planner 组织 (v4)
  plan_id: number;               // 所属 Plan ID
  bucket_id?: number;            // 所属 Bucket ID
  labels: number[];              // 关联 Label IDs
  notes: string;                 // 笔记/描述
  checklist: ChecklistItem[];    // 子任务清单 [{id, text, checked}]
  
  // 时间属性 — 调度核心
  start_date?: string;           // 计划日期 (YYYY-MM-DD)，"哪天做"
  due_date?: string;             // 截止日期 (YYYY-MM-DD)，"最晚什么时候完成"
  schedule_time?: string;        // 指定时间 (HH:MM)，有则为定时任务
  duration: number;              // 预计耗时 (分钟)，默认 45
  
  // 组织属性
  subject?: string;              // 学科（继承自 Plan.subject）
  
  // 状态
  priority: 'urgent' | 'important' | 'medium' | 'low';  // 优先级
  progress: 'not_started' | 'in_progress' | 'completed'; // 执行状态
  completed_at?: string;         // 完成时间 ISO 8601
  
  // Legacy 兼容字段（db.js 双向同步）
  description?: string;          // = notes
  status?: string;               // = progress 映射 (pending/in_progress/completed)
  deadline?: string;             // = due_date
  bucket?: string;               // 旧 bucket 字符串
  container_id?: string;         // 旧容器关联
  
  // 元数据
  created_at: string;           // 创建时间 ISO 8601
  updated_at: string;            // 更新时间 ISO 8601
  google_task_id?: string;      // Google Tasks 中的 ID
}
```

**时间属性与调度的关系**：

| 字段 | 含义 | Daily Settle 用途 |
|------|------|-------------------|
| `start_date` | 计划日期 | 构建当日池：`start_date <= today \|\| null` |
| `due_date` | 截止日期 | 排序权重：overdue 优先、近者优先 |
| `schedule_time` | 定时时间 | 容器内最高优先级；过时后降级 |
| `duration` | 预计耗时 | 容器容量计算与溢出判断 |

**优先级映射**（v4 ↔ v2 兼容）：

| v4 (progress) | v2 (status) | v4 (priority) | v2 (priority) |
|---------------|-------------|---------------|---------------|
| not_started | pending | urgent | P1 |
| in_progress | in_progress | important | P2 |
| completed | completed | medium | P3 |
| — | — | low | P4 |

### 2.2 Bucket 类型

```typescript
const BUCKETS = {
  HOMEWORK: 'homework',         // 作业
  TEST: 'test',                  // 考试/测验
  IA: 'ia',                      // 内部评估 (IA/EE/TOK)
  NOTES: 'notes',                // 笔记整理
  REVIEW: 'review',              // 复习
  PROJECT: 'project',            // 项目
  OTHER: 'other'                 // 其他
};
```

### 2.3 Subject 学科

```typescript
const SUBJECTS = {
  MATH: 'Math',
  CHEMISTRY: 'Chemistry',
  BIOLOGY: 'Biology',
  PHYSICS: 'Physics',
  ENGLISH: 'English',
  CHINESE: 'Chinese',
  HISTORY: 'History',
  ECONOMICS: 'Economics',
  VISUAL_ARTS: 'Visual Arts',
  EE: 'EE',
  TOK: 'TOK',
  CAS: 'CAS',
  OTHER: 'Other'
};
```

### 2.4 Priority 优先级

| 优先级 | 名称 | 说明 | 颜色 |
|--------|------|------|------|
| P1 | 紧急 | 必须立即处理 | 🔴 红色 |
| P2 | 重要 | 截止日期临近 | 🟠 橙色 |
| P3 | 一般 | 常规任务 | 🟡 黄色 |
| P4 | 低 | 可延后 | 🟢 绿色 |

---

## 3. TimeContainer 时间容器

### 3.1 模型定义

```typescript
interface TimeContainer {
  // 基础信息
  id: number;                    // auto-increment
  name: string;                  // 容器名称
  color: string;                 // 显示颜色 (#HEX)

  // 层级 — Daily Settle 调度核心
  layer: 1 | 2;                  // 1=学习时间(主力), 2=自由时间(溢出接收)

  // 时间配置
  time_start: string;            // 开始时间 (HH:MM)
  time_end: string;              // 结束时间 (HH:MM)

  repeat: 'none' | 'daily' | 'weekday' | 'weekend' | 'weekly'
        | 'monthly_nth' | 'yearly' | 'custom' | 'once';
  repeat_days?: number[];        // weekly/custom: [0,1,2,3,4,5,6] (0=周日)
  monthly_week?: number;         // monthly_nth: 第几个 (1-4)
  monthly_dow?: number;          // monthly_nth: 周几 (0=周日)
  yearly_month?: number;         // yearly: 月份 (1-12)
  yearly_dom?: number;           // yearly: 日期 (1-31)
  once_date?: string;            // once: 指定日期 YYYY-MM-DD

  // 承载规则
  task_types: string[];          // 允许的 bucket 类型
  subjects?: string[];           // 允许的学科 (空=全部)

  // 防御等级（MVP 未启用）
  defense: 'hard' | 'soft';
  squeezing: 'none' | 'p1_only' | 'p1_p2';

  // 状态
  enabled: boolean;
  google_calendar_event_id?: string;

  created_at: string;
  updated_at: string;
}
```

**layer 字段说明**：

| layer | 含义 | Daily Settle 行为 |
|-------|------|------------------|
| 1 | 学习时间 | 主分配：优先填充任务 |
| 2 | 自由时间 | 溢出接收：学习时间装不下的任务溢出到这里 |

溢出方向：先向前（时间更早的 L2），再向后（时间更晚的 L2）。

### 3.2 重复规则说明

| repeat 值 | 说明 | 配套字段 |
|-----------|------|---------|
| `none` | 不重复（已停用） | — |
| `daily` | 每天 | — |
| `weekday` | 每个工作日（周一至周五） | — |
| `weekend` | 每个周末（周六、周日） | — |
| `weekly` | 每周指定星期 | `repeat_days: [dow]` |
| `monthly_nth` | 每月第 N 个星期 X | `monthly_week`, `monthly_dow` |
| `yearly` | 每年在 M 月 D 日 | `yearly_month`, `yearly_dom` |
| `custom` | 自定义多天 | `repeat_days: [dow, ...]` |
| `once` | 仅一次 | `once_date` |

### 3.3 默认容器配置

新用户首次打开 Focus Dashboard 时自动创建（`ensureDefaultContainers()`）：

```typescript
const DEFAULT_CONTAINERS = [
  {
    name: '自由时间',       // 放学后
    color: '#7B68EE',
    time_start: '15:30',
    time_end: '18:30',
    repeat: 'daily',
    layer: 2,
    task_types: ['homework', 'test', 'ia', 'notes', 'review', 'project', 'other'],
    defense: 'soft',
    squeezing: 'p1_p2'
  },
  {
    name: '学习时间',       // 主力学习时段
    color: '#4A90D9',
    time_start: '18:30',
    time_end: '21:30',
    repeat: 'weekday',
    layer: 1,
    task_types: ['homework', 'test', 'ia', 'notes', 'review'],
    defense: 'soft',
    squeezing: 'p1_only'
  },
  {
    name: '自由时间',       // 晚间
    color: '#7B68EE',
    time_start: '21:30',
    time_end: '22:30',
    repeat: 'daily',
    layer: 2,
    task_types: ['homework', 'test', 'ia', 'notes', 'review', 'project', 'other'],
    defense: 'soft',
    squeezing: 'p1_p2'
  }
];
```

### 3.4 容器容量计算

```javascript
// 计算容器可用时间
function calculateContainerCapacity(container, schedule) {
  const start = parseTime(container.time_start);
  const end = parseTime(container.time_end);
  const totalMinutes = end - start;
  
  // 减去已安排任务的时长
  const scheduledTasks = schedule
    .filter(t => t.schedule_container === container.id)
    .reduce((sum, t) => sum + t.duration, 0);
  
  return {
    total: totalMinutes,
    used: scheduledTasks,
    available: totalMinutes - scheduledTasks
  };
}
```

---

## 4. Event 日历事件

### 4.1 模型定义

```typescript
interface Event {
  id: number;                   // auto-increment
  title: string;                // 事件标题
  date: string;                 // YYYY-MM-DD

  // 时间 (全天事件时均为 null)
  time_start: string | null;    // HH:MM
  time_end: string | null;      // HH:MM

  color: string;                // #HEX
  description?: string;

  // 来源标识 — 决定渲染方式和删除范围
  source: 'manual'              // 用户手动创建
        | 'timetable'           // ICS 导入（课表）
        | 'container_override'  // 修改容器此次 → 替代容器显示
        | 'container_skip';     // 删除容器此次 → 隐藏容器

  container_id?: number;        // override/skip 时指向被替代的容器
  google_calendar_event_id?: string;

  created_at: string;
  updated_at: string;
}
```

### 4.2 source 字段说明

| source | 来源 | 批量操作范围 |
|--------|------|-------------|
| `manual` | 用户在日历中手动创建 | 单条删除 |
| `timetable` | ICS 文件导入 | 重新导入时清空全部同 source 事件 |
| `container_override` | 编辑容器"仅此次" | 随容器删除级联清除 |
| `container_skip` | 删除容器"仅此次" | 随容器删除级联清除 |

### 4.3 容器 Override/Skip 机制

当用户编辑或删除**某一天**的时间容器时，系统不直接修改容器本身，而是创建一条 Event 记录：

**编辑此次** → 创建 `source: 'container_override'` 事件，保存修改后的标题/时间/颜色，`container_id` 指向原容器。当天渲染时，原容器被替换为该 override 事件显示。

**删除此次** → 创建 `source: 'container_skip'` 事件，`container_id` 指向原容器。当天渲染时，跳过该容器。

渲染逻辑（`renderWeekColumns` / `renderMonthEvents`）：
```javascript
const dayOverrides = dbEvents.filter(e => e.date === dateStr &&
    (e.source === 'container_override' || e.source === 'container_skip'));
const overriddenIds = new Set(dayOverrides
    .filter(e => e.source === 'container_override').map(e => e.container_id));
const skippedIds = new Set(dayOverrides
    .filter(e => e.source === 'container_skip').map(e => e.container_id));

// 容器渲染时过滤掉 skipped + overridden 的容器
// override 事件作为普通 event 渲染
```

---

## 5. Habit 习惯

### 4.1 模型定义

```typescript
interface Habit {
  // 基础信息
  id: string;
  title: string;                // 习惯名称
  description?: string;          // 描述
  
  // 频率配置
  frequency: 'daily' | 'weekly' | 'custom';
  target_count: number;         // 每周期目标次数
  repeat_days?: number[];       // custom 模式: 周几执行 [1,2,3,4,5]
  
  // 状态
  completed_count: number;      // 当前周期完成次数
  streak: number;               // 连续完成天数
  best_streak: number;          // 历史最佳连续天数
  status_today: 'pending' | 'done' | 'skipped';
  
  // 关联
  container_id?: string;        // 关联容器 (可选)
  
  // 统计
  total_completed: number;      // 累计完成次数
  last_completed?: string;      // 上次完成时间
  
  created_at: string;
  updated_at: string;
}
```

### 4.2 Habit 特殊规则

```javascript
// Habit 不参与:
// 1. Arrange 调度
// 2. 时间容器分配
// 3. Overdue 计算

// Habit 参与:
// 1. 每日提醒
// 2. 连续天数统计
// 3. 完成状态记录
```

---

## 6. Settings 配置

### 5.1 模型定义

```typescript
interface Settings {
  // 初始化状态
  initialized: boolean;          // 是否已完成初始化
  first_launch?: string;         // 首次启动时间
  
  // Google 连接
  google_connected: boolean;    // 是否已连接 Google
  google_email?: string;         // Google 账号邮箱
  access_token?: string;         // OAuth Access Token (加密存储)
  refresh_token?: string;        // OAuth Refresh Token (加密存储)
  
  // 同步配置
  sync_enabled: boolean;        // 是否启用同步
  sync_interval: number;         // 同步间隔 (分钟)
  last_sync?: string;           // 上次同步时间
  
  // Pomodoro
  pomodoro_work: number;        // 工作时长 (默认 25)
  pomodoro_break: number;       // 休息时长 (默认 5)
  pomodoro_long_break: number;  // 长休息时长 (默认 15)
  pomodoro_interval: number;    // 长休息间隔 (默认 4)
  
  // UI
  theme: 'light' | 'dark';     // 主题
  start_week_on: 0 | 1;         // 周几开始一周 (0=周日, 1=周一)
  
  // 提醒
  notification_enabled: boolean;
  reminder_before: number;       // 提前提醒分钟数
}
```

---

## 7. Sync State 同步状态

### 6.1 模型定义

```typescript
interface SyncState {
  pending_changes: PendingChange[];  // 待同步变更
  conflict_log: Conflict[];         // 冲突记录
  error_log: SyncError[];           // 错误记录
}

interface PendingChange {
  id: string;                   // 变更 ID
  type: 'task' | 'container' | 'habit';
  action: 'create' | 'update' | 'delete';
  entity_id: string;            // 实体 ID
  timestamp: string;            // 变更时间
  data?: any;                   // 变更数据
}

interface Conflict {
  id: string;
  type: 'task' | 'container';
  entity_id: string;
  local_data: any;
  remote_data: any;
  resolved: boolean;
  resolved_at?: string;
  resolution?: 'local' | 'remote' | 'merged';
}
```

---

## 8. 完整存储结构

```javascript
{
  version: 1,
  
  // 核心数据
  tasks: [
    {
      id: 'uuid-xxx',
      title: 'Chem IA Draft',
      description: '完成第一版草稿',
      duration: 90,
      deadline: '2026-04-15',
      bucket: 'ia',
      subject: 'Chemistry',
      priority: 'P1',
      status: 'pending',
      created_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z'
    }
  ],
  
  containers: [
    {
      id: 'container-1',
      name: '学习时间',
      color: '#4A90D9',
      time_start: '18:30',
      time_end: '21:30',
      repeat: 'weekday',
      task_types: ['homework', 'test', 'ia', 'notes'],
      defense: 'soft',
      enabled: true,
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-01T00:00:00Z'
    }
  ],
  
  habits: [
    {
      id: 'habit-1',
      title: '每日背单词',
      frequency: 'daily',
      target_count: 1,
      completed_count: 0,
      streak: 5,
      best_streak: 12,
      status_today: 'pending',
      total_completed: 45,
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-04-02T00:00:00Z'
    }
  ],
  
  settings: {
    initialized: true,
    google_connected: true,
    sync_enabled: true,
    sync_interval: 5,
    pomodoro_work: 25,
    pomodoro_break: 5,
    theme: 'dark'
  },
  
  sync_state: {
    pending_changes: [],
    conflict_log: [],
    error_log: []
  }
}
```

---

---

## 9. 待实现功能（Backlog）

### P2

| 功能 | 说明 |
|------|------|
| 拖拽调整时间/日期 | 周视图中拖动事件卡片修改时间段或移动到其他天 |
| 键盘快捷键 | N 新建、E 编辑、Del 删除、← → 切换周/月 |
| ICS 导出 | 将当前日历事件导出为标准 .ics 文件 |
| 空状态引导 | 首次进入日历时引导用户创建第一个容器 |
| 容器可见性开关 | 工具栏中切换显示/隐藏特定容器 |

### P3

| 功能 | 说明 |
|------|------|
| Undo / Redo | 撤销/重做最近操作 |
| 响应式布局 | 适配不同窗口宽度（抽屉式侧边栏等） |
| 日视图 | 单日详细时间轴视图 |
| 多日事件 | 跨多天事件的连续渲染 |
| 时区支持 | 存储 UTC、按用户时区显示 |
| Google Sync | OAuth2 + Tasks/Calendar API 实际对接（现为 stub） |
| ManageBac 订阅 | 解析 ManageBac ICS 订阅链接自动导入任务 |

---

**最后更新**: 2026-04-14 (v2.3)
