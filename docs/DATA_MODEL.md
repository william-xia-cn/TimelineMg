# TimeWhere 数据模型

**版本**: v2.3  
**日期**: 2026-04-14

> Current baseline note (2026-05-15): Internal MVP acceptance is approved for a local-first MVP. This document is aligned to D-013: `tasks`, `containers`, `events`, and `habits` use string UUID ids; planner helper records such as `plans`, `buckets`, and `labels` may remain numeric for now. MatrixView import, ManageBac mapping/task-sync, and Task Date Arrange are active baseline stabilization features. Google Sync, background alarm automation, reminder notifications, Chrome Web Store submission, and public release are out of current scope.

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
  start_date?: string;           // 计划日期 (YYYY-MM-DD)，"哪天做"；手动新建任务未填时默认等于 due_date
  due_date?: string;             // 截止日期 (YYYY-MM-DD)，"最晚什么时候完成"；手动新建任务必填
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
| `start_date` | 计划日期，本地调度字段，决定哪天做 | 构建当日池：`start_date <= today \|\| null` |
| `due_date` | 截止日期，来源/用户事实字段 | 排序权重：overdue 优先、近者优先；用于 Task Date Arrange 的 priority 升级判断 |
| `schedule_time` | 定时时间 | 容器内最高优先级；过时后降级 |
| `duration` | 预计耗时 | 容器容量计算与溢出判断 |

手动创建任务的产品规则：`due_date` 必填；如果用户没有填写 `start_date`，创建时应把 `start_date` 设置为同一个 `due_date`。该规则约束 Task Board / Planner 的手动创建和快捷新增入口，不要求立刻执行 DB schema migration；历史任务、导入任务和来源同步任务可按各自来源规则保留兼容字段。

Task Date Arrange 可更新未完成任务的本地 `start_date`，并根据 `due_date` 将 `priority` 升级到 `important` 或 `urgent`。Arrange 不应降低用户已经设置得更高的 `priority`，也不应处理 `progress='completed'` 的任务。Arrange 写入必须通过 preview / 用户确认流程触发，不能在页面打开时静默修改任务。

统一管理检查使用 `settings` 表保存本地 pending 状态：

| Setting key | 用途 |
|-------------|------|
| `management_review_pending` | Dashboard / manual ManageBac sync 生成的待确认状态，包含 Arrange preview changes、ManageBac pending event mappings、source、created_at。存在未完成 pending 时应恢复确认页继续处理。 |
| `management_review_last_checked_at` | Dashboard 六小时管理检查的最近完成时间。只有没有待确认项、确认导入完成、或全部跳过完成后才更新。 |

Popup、Calendar、Planner 页面打开不得写入这些 key 触发六小时自动检查；Planner `my ManageBac` 手动同步可以写入 `management_review_pending`，但只包含 ManageBac 待确认项，不包含 Arrange changes。

**优先级映射**（v4 ↔ v2 兼容）：

| v4 (progress) | v2 (status) | v4 (priority) | v2 (priority) |
|---------------|-------------|---------------|---------------|
| not_started | pending | urgent | P1 |
| in_progress | in_progress | important | P2 |
| completed | completed | medium | P3 |
| — | — | low | P4 |

### 2.2 Bucket / Label 类型

```typescript
interface Bucket {
  id: number;                    // planner helper id
  plan_id: number;               // 所属 Plan
  name: string;                  // Plan 内显示名称
  sort_order: number;
}

interface Label {
  id: number;                    // planner helper id
  plan_id: number;               // 所属 Plan
  name: string;
  color?: string;
}

const SUBJECT_PLAN_DEFAULT_BUCKETS = [
  '上课',
  '作业',
  '单元测试',
  '阶段考试'
];

const OTHER_SCHOOL_PLAN_DEFAULT_BUCKETS = [
  '事项',
  '活动',
  '申请',
  '其他'
];

interface TaskSourceMetadata {
  source?: 'manual' | 'managebac' | 'matrixview' | string;
  source_type?: string;
  source_uid?: string;
  source_updated_at?: string;
  managebac_subject?: string;
  source_url?: string;
  readonly?: boolean;
};
```

`Bucket` 和 `Label` 都从属于具体 `Plan`。`Bucket` 用于 Plan 内任务分类，可以从初始化模板生成，但用户可在每个具体 Plan 内修改、删除、增补和排序；它不是全局固定枚举。`Label` 当前保留为 Plan 内标签能力，但不承担核心分类定义。

ManageBac 是 Task source metadata，不是 Bucket，也不是 Label。ManageBac 来源任务仍通过 `plan_id` 归属于某个 Plan，并可通过 `bucket_id` 归入该 Plan 内的某个 Bucket。

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

### 2.5 Planner Plan 定义

`Plan` 是 Task Board / planner 模块中的任务组织单元，不是课表事件、时间容器或 MatrixView 原始记录。

MatrixView 导入中的“初始化学科 Plan 数据”定义为：

1. 以用户确认后的系统内部 `Subject` 为主键语义，为每个 Subject 创建或更新一个 planner `Plan`。
2. `Plan.name` 默认等于内部 `Subject`，用于 Task Board 侧边栏、后续计划名称和任务归属。
3. `Plan.subject` 保存同一个内部 `Subject`，用于任务继承学科、排课、统计和规则匹配。
4. `Subject in MatrixView` 是外部原始课程文本，应作为映射来源保存，不能替代内部 `Subject`。
5. 初始化时为每个新建学科 Plan 创建默认 buckets：`上课`, `作业`, `单元测试`, `阶段考试`。
6. 初始化应重建学科 Plan 集合：清除旧的学科相关 Plan，再按当前 MatrixView Subject 映射创建新的学科 Plan。
7. 初始化时必须确保存在一个名为 `Other School Plan` 的 planner Plan，用于保存未来非学科但仍属于学校相关的任务，并为该 Plan 创建默认 buckets：`事项`, `活动`, `申请`, `其他`。
8. 明显非学科用途的 Plan 必须保留，例如 `其它计划`, `大学申请`, `Personal`, `Projects` 等。
9. 初始化必须幂等：同一个内部 `Subject` 不应重复创建多个 Plan；重复执行后，学科 Plan 集合与 `Other School Plan` 应与当前初始化规则一致。

学科 Plan 清理判定：

| Plan 类型 | 判定 | 初始化处理 |
|---|---|---|
| MatrixView 管理的学科 Plan | 有 MatrixView subject mapping 或 `source='matrixview'` 元数据 | 清除后重建 |
| 普通学科 Plan | `plan.subject` 存在，或 `Plan.name` 明显匹配学科名称/简称，如 `Math`, `English`, `Physics`, `TOK` | 清除后重建 |
| 学校非学科 Plan | `Plan.name = "Other School Plan"` | 保留或创建；不得重复 |
| 非学科 Plan | 名称明显与学科无关，如 `其它计划`, `大学申请`, `Personal`, `Projects` | 保留 |
| 不确定 Plan | 名称无法判断是否学科相关 | 不自动删除；应提示用户确认 |

当前实现中的 `plans`, `buckets`, `labels` 仍可使用 numeric helper ids。MatrixView 导入不改变 D-013 对 `tasks`, `containers`, `events`, `habits` 使用 string UUID 的决定。

```typescript
interface Plan {
  id: number;                    // planner helper id, may remain numeric
  name: string;                  // 默认等于内部 Subject，如 "Math"
  subject?: string;              // 内部 Subject 简写
  color: string;                 // 显示颜色
  icon_char: string;             // 侧边栏图标字符
  created_at: string;
  updated_at: string;
}

interface SubjectMatrixViewMapping {
  subject: string;               // TimeWhere 内部 Subject 简写
  subject_in_matrixview: string; // MatrixView 原始课程文本
  plan_id: number;               // 关联 planner Plan
  source: 'matrixview';
  updated_at: string;
}
```

### 2.6 ManageBac 任务同步定义

ManageBac 导入不同于 MatrixView 课表导入：

- MatrixView 用于建立课表 / Subject / Plan 初始化基础。
- ManageBac 分为两步：先从 ManageBac HTML 文件读取学科配置并映射到已有 MatrixView 学科 Plan；再从稳定的 ICS 订阅链接同步学校任务或日历事件，并转为 planner Tasks。

ManageBac 的 HTML 学科配置只建立映射，不创建、删除或重命名 MatrixView 初始化出的学科 Plan。ManageBac 的 ICS 链接是 ManageBac 来源 Task 的来源内容事实来源。链接不变时，再次同步应视为更新。当前 Task 通过 `plan_id` 归属于 planner `Plan`；ManageBac 事件转换出的 Task 也应写入对应 `plan_id`。来源内容只读不是现有 Task 数据层的默认能力，必须通过来源元数据和 Task Board / DB 写操作保护显式实现。用户本地执行状态不属于来源内容，`progress` / `completed_at` 必须允许用户修改。

ManageBac ICS 链接是一次配置的私有同步链接。后续手动同步应复用已保存链接；未来自动同步也应复用同一配置，除非用户主动修改链接。ManageBac task sync UI 不提供本地 `.ics` 文件选择。

```typescript
interface SubjectManageBacMapping {
  subject: string;               // TimeWhere 内部 Subject / Plan 名称；来自已有 MatrixView Plan
  subject_in_managebac: string;  // ManageBac 原始课程 / 日历文本
  plan_id: number;               // 关联 planner Plan
  source: 'managebac';
  updated_at: string;
}

interface ManageBacClassConfigImport {
  source: 'managebac_html';
  imported_at: string;
  mappings: SubjectManageBacMapping[];
}

interface ManageBacSubscriptionSettings {
  source: 'managebac';
  url: string;                   // 用户私有 webcal/ics 链接，不应写入公开文档或 fixture
  sync_mode: 'manual' | 'automatic';
  auto_sync_enabled?: boolean;    // 当前可为 false；未来自动同步复用同一 url 配置
  last_imported_at?: string;
  updated_at: string;
}
```

ManageBac 来源 Task 需要带来源元数据，便于同步、去重和来源内容只读保护：

```typescript
interface ManageBacTaskSource {
  source: 'managebac';
  plan_id: number;               // Task 仍通过 plan_id 归属于对应 planner Plan
  external_uid: string;          // ICS UID 或稳定事件 key
  external_updated_at?: string;  // ICS LAST-MODIFIED / DTSTAMP 等
  source_url_hash?: string;      // 可选：链接 hash，不保存到公开证据
  read_only: true;               // 来源内容不可直接修改或删除；不禁止本地执行/调度字段
}
```

同步规则：

1. ManageBac HTML 学科配置导入必须在 MatrixView 导入和学科 Plan 初始化之后执行。
2. ManageBac HTML 学科配置导入只保存 `Subject in ManageBac` 到已有内部 `Subject` / `Plan` 的映射，不修改学科 Plan。
3. ManageBac ICS 同步前必须已有 ManageBac 学科映射。
4. 每个 ManageBac 事件转换为 `tasks` 表记录，通过 `plan_id` 归属到对应 planner Plan，并标记为 ManageBac 来源任务。
5. Planner 的 `My Tasks -> my ManageBac` 是 ManageBac 来源 Task 的聚合查看入口和手动同步入口；它不是学科 Plan。Task 仍通过 `plan_id` 归属于映射后的学科 Plan 或 `Other School Plan`。
6. 链接不变时，再次同步只更新 ManageBac 来源任务，不创建重复任务。
7. 同步 UI 不提供本地 `.ics` 文件选择；用户只能配置 / 修改 ManageBac 订阅链接。
8. ICS 中删除或消失的事件应从本地 ManageBac 来源任务中移除或标记为已取消；具体策略由实现 spec 明确。
9. 用户修改链接时必须确认旧来源任务处理策略。
10. Task Board 与 DB 写入口必须保护 ManageBac 来源任务的来源内容不可直接编辑或删除，并提示“来源为 ManageBac ICS”；同步导入流程本身可以更新这些来源内容字段。
11. ManageBac 来源内容包括 title / summary、description、due date / deadline、source UID、source URL、ManageBac subject、source metadata。用户普通编辑与 Task Date Arrange 都不得覆盖这些字段。
12. `progress` / `completed_at` 是 TimeWhere 本地执行状态，`start_date` / `priority` 是 TimeWhere 本地调度字段，都不属于 ManageBac 来源内容。用户必须可以把 ManageBac 来源任务标记为 in progress / completed / not started；Task Date Arrange 可以调整 `start_date` / `priority`。同步更新已有任务时必须保留这些本地执行和调度字段，不能因为 ICS 更新而重置。

---

## 3. TimeContainer 时间容器

### 3.1 模型定义

```typescript
interface TimeContainer {
  // 基础信息
  id: string;                    // UUID / generated string id
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

## 4. Event 日程事件

### 4.1 模型定义

```typescript
interface Event {
  id: string;                   // UUID / generated string id
  title: string;                // 日程事件标题
  date: string;                 // 起始日期 YYYY-MM-DD

  // 时间 (全天事件时均为 null)
  time_start: string | null;    // HH:MM
  time_end: string | null;      // HH:MM

  // 重复规则。日程事件可以是一次性，也可以重复发生。
  repeat: 'none' | 'daily' | 'weekday' | 'weekend' | 'weekly'
        | 'monthly_nth' | 'yearly' | 'custom' | 'once';
  repeat_days?: number[];       // weekly/custom: [0,1,2,3,4,5,6]
  monthly_week?: number;        // monthly_nth
  monthly_dow?: number;         // monthly_nth
  yearly_month?: number;        // yearly
  yearly_dom?: number;          // yearly
  once_date?: string;           // once

  color: string;                // #HEX
  description?: string;

  // 来源标识 — 决定渲染方式和删除范围
  source: 'manual'              // 用户手动创建
        | 'timetable'           // ICS 导入（课表）
        | 'container_override'  // 修改容器此次 → 替代容器显示
        | 'container_skip';     // 删除容器此次 → 隐藏容器

  container_id?: string;        // override/skip 时指向被替代的容器
  google_calendar_event_id?: string;

  created_at: string;
  updated_at: string;
}
```

术语边界：

- `Event` 表示 Calendar 中的日程事件，不应被理解为只能出现一次的“单次事件”。
- `Event.repeat = 'none'` 或 `once` 时才是一次性日程事件。
- `TimeContainer` 与 `Event` 都可以有重复规则，但语义不同：`TimeContainer` 用于任务容量/承载规则，`Event` 用于显示外部课表、手动日程、全天事项或容器 override/skip。

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
// 1. Task Date Arrange 调度
// 2. 时间容器分配
// 3. Overdue 计算

// Habit 当前参与:
// 1. 连续天数统计
// 2. 完成状态记录
// Reminder notification system is future scope.
```

---

## 6. Settings 配置

### 5.1 模型定义

```typescript
interface Settings {
  // 初始化状态
  initialized: boolean;          // 是否已完成初始化
  first_launch?: string;         // 首次启动时间
  
  // Local-first MVP: Google/OAuth sync fields are not active.
  google_connected: false;
  sync_enabled: false;
  
  // Pomodoro
  // Current Settings UI exposes `pomodoro_work` only.
  // The remaining Pomodoro fields are initialized defaults / future UI.
  pomodoro_work: number;        // 工作时长 (默认 25)
  pomodoro_break: number;       // 休息时长 (默认 5)
  pomodoro_long_break: number;  // 长休息时长 (默认 15)
  pomodoro_interval: number;    // 长休息间隔 (默认 4)
  
  // UI
  theme: 'light' | 'dark' | 'system'; // 主题
  start_week_on: 0 | 1;         // 周几开始一周 (0=周日, 1=周一)
  appearance_background: 'calm' | 'focus' | 'morning' | 'evening';
  appearance_avatar: 'default' | 'student' | 'school' | 'focus';
  
  // Reminder notification system is out of current MVP scope.
}
```

Current Settings page implementation:

- Main settings view exposes theme, week start, Pomodoro work duration, appearance background/avatar, default task duration, default priority, ICS file import, container management, JSON import/export, settings reset, and reinitialization.
- The first-run wizard is implemented as Welcome → Schedule initialization → Task initialization placeholder → Complete.
- Reinitialization clears local business data and sets `initialized=false`; settings reset only resets the `settings` table.

---

## 7. Sync State 同步状态（D-019 planned）

当前 Internal MVP 不执行远程同步。D-019 已批准下一阶段 Google 数据同步方向：TimeWhere 仍然 local-first，Google 账号是可选同步配置，只用于云端持久化和跨终端双向同步。本地 IndexedDB 仍是运行时主数据库；Google Drive `appDataFolder` 保存同步副本。OAuth client ID 只标识 TimeWhere 扩展应用；同步副本属于当前授权用户自己的 Google Drive，不属于开发者账号。

第一阶段同步不使用 Google Tasks / Google Calendar API，不引入服务器端账号系统，不把 Google 账号作为使用 TimeWhere 的前置条件。

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

### 7.2 Planned Google sync metadata

后续可同步实体应具备本地同步元数据。该设计不要求立即迁移历史数据，但实现同步前必须有兼容填充策略。

```typescript
interface SyncMetadata {
  sync_updated_at?: string;
  sync_deleted_at?: string | null;
  sync_version?: number;
  sync_device_id?: string;
  sync_status?: 'local' | 'synced' | 'conflict' | 'error';
}
```

同步范围：

- `plans`
- `buckets`
- `labels`
- `tasks`
- `containers`
- `events`
- `habits`
- selected `settings`

必须同步的 settings：

- Google sync metadata/state.
- MatrixView subject mappings.
- ManageBac subject mappings.
- ManageBac ICS link, because Product Owner requires cross-device persistence for that configuration.

不得同步或不得明文进入 repo/test fixture：

- OAuth access token / refresh token.
- raw private import files.
- temporary pending UI states unless specifically required for sync recovery.
- screenshots, emails, account identifiers, or unredacted private sample data.

### 7.3 Planned cloud snapshot shape

Google Drive `appDataFolder` 中建议保存：

```text
timewhere-sync-manifest.json
timewhere-snapshot-v1.json
timewhere-changes-v1.jsonl  // optional later optimization
```

第一版建议先以 snapshot 双向同步为主，再决定是否启用增量 changelog。

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
    google_connected: false,
    sync_enabled: false,
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
| Google 数据同步 | D-019 planned; current `sync.js` remains an explicit local-first stub until a concrete implementation package is approved. |
| ManageBac 自动同步 | Future only; current ManageBac follow-up supports saved subscription-link configuration, manual sync, and user-confirmed task creation. |

---

**最后更新**: 2026-05-15 (Task Date Arrange / ManageBac / Google data sync boundary)
