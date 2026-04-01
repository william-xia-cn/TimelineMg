# IB-AMS 系统设计笔记

**日期**: 2026-03-31
**版本**: v1.5
**状态**: 🔄 概念设计进行中

---

## 工作阶段

- [x] 需求分析 (Requirement Analysis)
- [x] 概念设计 (Conceptual Design) - 核心部分完成
- [ ] 结构设计 (Structural Design)
- [ ] 实现规划 (Implementation Planning)

---

## 第一部分：核心概念体系

## 1.1 五大核心实体

| 实体 | 层级 | 定义 |
|------|------|------|
| **事件 Event** | Layer 0 | 固定时间、必须参与的确定性日程，不可侵占 |
| **时间容器 Time Container** | Layer 1 | 用户定义的时间段（课后/学习/睡前），手动配置时间范围 |
| **任务 Task** | Layer 2 | 有产出、截止时间的可执行待办 |
| **习惯 Habit** | Layer 2 | 长期重复的轻量型待办，无刚性截止 |
| **提醒 Reminder** | 辅助层 | 触发提示，无独立时间段 |

## 1.2 三层架构

```
┌─────────────────────────────────────────────────────┐
│ Layer 0：日程（不可侵占）                            │
│ 上课日程、KAP 日程（外部固定事件）                    │
├─────────────────────────────────────────────────────┤
│ Layer 1：时间容器（用户手动配置时间范围）              │
│ 课后时间容器、学习时间容器、睡前时间容器               │
├─────────────────────────────────────────────────────┤
│ Layer 2：任务/习惯                                   │
│ 上课总结任务、晚间导航任务、今日结算任务、其他普通任务  │
└─────────────────────────────────────────────────────┘
```

## 1.3 边界定义

| 对比组 | 差异点 | 判断原则 |
|--------|--------|----------|
| 习惯 vs 任务 | 习惯无计量产出目标 | 有计量产出目标 → 任务 |
| 容器 vs 任务 | 容器是时段，任务是待办 | 容器内填充的是任务/习惯 |
| 事件 vs 容器 | 事件不可替换，容器可灵活调度 | 事件内容固定不可变 |
| 容器 vs 任务(名称) | "上课总结容器"是时段，"上课总结任务"是待办 | 名称相似但本质不同 |

---

## 第二部分：任务模块设计

## 2.1 核心实体关系

```
Task（唯一存储实体）
├── 普通 Task：常规任务，有 deadline
├── Habit Task：习惯任务，无 deadline，有 Habit 属性
└── TaskTemplate（任务模板，用于批量创建）
    └── 模板数据，不是任务本身

Plan (组织视图)
├── 定义：组织和呈现 Task 的方式
├── 内容：包含多个 Bucket 和 Task
├── 特点：始终存在，可按 Plan 筛选 Task

Template (Plan 模板)
├── 定义：创建 Plan 时的参考骨架
├── 内容：预设 Bucket 结构 + Task 参考
└── 特点：创建后与实例脱钩，不可编辑

时间容器
├── 定义：承载任务的时间段规则
├── 规则：task_types (承载任务类型白名单)
└── 特点：容器决定填充哪些 Task，Task 是被动的
```

## 2.2 属性定义

### Subject（学科属性）
- 独立属性，原则对应一个 Plan
- 用于 Arrange 调度匹配课表
- 示例：Math, Chemistry, EE, TOK, CAS

### Bucket（工作属性）
- 任务的工作类型，不是 Plan 内的分组
- 示例：作业、测试、IA、笔记整理

## 2.3 Task 模型（统一实体）

```typescript
interface Task {
  // 基础属性
  id: UUID;
  title: string;
  description?: string;
  duration: number;          // 分钟

  // 时间属性
  schedule_date?: Date;        // 安排日期（由 Arrange 确定）
  schedule_time?: Time;        // 初定开始时间
  deadline?: Date;             // 截止日期（影响优先级）
  deadline_time?: Time;       // 截止时间（可选）

  // 组织属性
  bucket: string;            // 工作属性：作业、测试、IA 等
  plan_id: UUID;             // 归属 Plan

  // IB 元数据
  subject?: Enum;            // 学科属性
  criteria_ref?: string;      // 评估准则
  word_count?: number;       // 字数限制

  // Habit 属性（仅 Habit Task 有值）
  is_habit: boolean;         // 是否为习惯任务
  frequency?: Enum;          // daily / weekly / custom
  target_count?: number;      // 每周目标次数
  completed_count?: number;   // 当前周期已完成的次数
  streak?: number;            // 连续天数
  status_today?: Enum;       // pending / done / skipped

  // 状态
  status: Enum;              // pending / in_progress / completed
  priority: Enum;            // P1/P2/P3/P4
  completed_at?: Date;
}
```

### 时间属性说明

| 属性 | 用途 |
|------|------|
| schedule_date | Arrange 调度：任务安排到哪天 |
| schedule_time | 初定开始时间 |
| deadline | Slack 计算 + 判定优先级 |
| deadline_time | Slack 计算精度 |

### Habit Task vs 普通 Task

| 维度 | 普通 Task | Habit Task |
|------|-----------|------------|
| is_habit | false | true |
| deadline | 有 | 无 |
| 调度 | 参与 Arrange + daily | 不参与，只呈现提醒 |
| 完成判定 | deadline 前完成 | completed_count = target_count |

## 2.4 TaskTemplate 模型（模板，非任务）

```typescript
interface TaskTemplate {
  id: UUID;
  title: string;

  // 创建时使用
  target_frequency?: number;   // 目标次数
  duration: number;           // 单次时长（分钟）
  cycle_start?: Date;         // 周期开始
  cycle_end?: Date;           // 周期结束

  // 组织属性
  bucket: string;
  plan_id: UUID;

  // IB 元数据
  subject?: Enum;
}
```

## 2.5 Plan 模型

```typescript
interface Plan {
  id: UUID;
  name: string;
  template_id?: UUID;         // 来源模板（可为 null）
  created_at: Date;
}
```

## 2.6 Template 模型

```typescript
interface Template {
  id: UUID;
  name: string;               // 如 "EE 专项模板"
  buckets: string[];          // 预设 Bucket 列表

  // Task 参考（创建时参考，不是任务本身）
  task_templates: {
    title: string;
    bucket: string;
    suggested_deadline: string;  // 如 "选题后2周"
    suggested_duration: number;  // 分钟
    subject?: string;
  }[];
}
```

## 2.7 创建路径

| 路径 | 说明 | 结果 |
|------|------|------|
| **按模板创建** | 从模板库选择 | Plan 继承模板 Bucket 结构 + Task 参考 |
| **自定义创建** | 空白创建 | Plan 仅含默认 Bucket |

## 2.8 模板库（预定义）

| 模板名称 | 预设 Bucket | Task 参考示例 |
|----------|-------------|---------------|
| **学科 IA 模板** | 选题 / 实验 / 分析 / 反馈 | 选题确认、实验计划、数据分析 |
| **EE 专项模板** | 研究准备 / 初稿 / 中期 / 终稿 | RPPF 会议、Viva Voce |
| **CAS 经历模板** | 调查 / 行动 / 反映 / 成果 | 7项 LO 勾选、证据上传 |
| **TOK 展览模板** | 物件 / Prompt / 文稿 / 展览 | 知识问题、950字检查 |

---

## 第三部分：动态调度模式

## 3.1 核心范式转移

```
传统模型:                      动态调度模型:
┌─────────────────┐            ┌─────────────────────────┐
│ 周一 背单词     │            │ 目标: 本周完成3次        │
│ 周三 背单词     │   →        │ 时长: 20分钟/次         │
│ 周五 背单词     │            │ 约束: 绑定时间容器       │
│ (时间固定)       │            │ 系统决定: 哪天执行       │
└─────────────────┘            └─────────────────────────┘
```

**[决策] 从"时间固定"到"目标约束"**
- 用户定义**目标**（次数）+ **时长**
- 系统基于**时间容器**决定执行时间

## 3.2 例行任务（通过模板创建）

```
用户创建 TaskTemplate（例行任务模板）
    ↓
模板指定：target_frequency, duration, cycle
    ↓
创建对应的 Task 实例（Habit Task）
    ↓
Habit Task 记录 completed_count
```

## 3.3 完成判定逻辑

```
普通 Task:
  deadline 前完成 → ✅ 完成

Habit Task:
  completed_count = target_count → ✅ 本周期完成
  completed_count < target_count → ❌ 未完成（影响 streak）
```

---

## 第四部分：时间容器设计

## 4.1 时间容器定义

时间容器是用户手动配置的时间段，用于承载任务的执行时间。

```typescript
interface TimeContainer {
  id: UUID;
  name: string;                // 如 "学习时间"
  time_start: Time;            // 18:30
  time_end: Time;              // 21:30
  repeat: Enum;               // daily / weekday / weekend / custom
}
```

## 4.2 三层架构

```
┌─────────────────────────────────────────────────────┐
│ Layer 0：日程（不可侵占）                            │
│ 上课日程、KAP 日程（外部固定事件）                    │
├─────────────────────────────────────────────────────┤
│ Layer 1：时间容器（用户手动配置时间范围）              │
│ 学习时间容器、自由时间容器、睡前时间容器               │
├─────────────────────────────────────────────────────┤
│ Layer 2：任务/习惯                                   │
│ 普通任务、Habit Task                                 │
└─────────────────────────────────────────────────────┘
```

## 4.3 时间线结构

### 工作日（Weekday）

```
┌─────────┬─────────┬─────────┬───────────────┬─────────────┐
│ 上课    │ KAP     │ 自由时间│ 学习时间      │ 睡前        │
│ (Layer0)│ (Layer0)│ (Layer1)│ (Layer1)    │ (Layer1)   │
└─────────┴─────────┴─────────┴───────────────┴─────────────┘
```

### 非上课日（Weekend / Holiday）

```
┌─────────────┬─────────────┬───────────────┬─────────┐
│ 日程事件    │ 学习时间    │ 自由时间      │ 睡前    │
│ (Layer0)   │ (Layer1)   │ (Layer1)     │ (Layer1)│
└─────────────┴─────────────┴───────────────┴─────────┘
```

### 说明
- 结算功能融入睡前时间容器（21:30-23:00）
- 睡前时间容器可承载结算类任务（如产出归档、愈合扫描）

## 4.4 容器分类

| 容器类型 | 说明 | 示例 |
|----------|------|------|
| **学习时间** | 用于高效学习的时段 | 18:30-21:30 |
| **自由时间** | 可灵活安排的时间 | KAP后-睡前 |
| **睡前时间** | 睡前的低强度时段，含结算功能 | 21:30-23:00 |

## 4.5 调度原则

```
- Task 不绑定 container_id
- 由时间容器的规则决定填充哪些 Task
- 容器根据 subject、bucket 等属性匹配 Task
- 时间差异由用户手动配置
```

---

## 第五部分：调度机制

## 5.1 关键概念

| 概念 | 说明 | 可修改性 |
|------|------|----------|
| **schedule_date** | 计划执行日期 | 用户可改，Arrange 可调度调整 |
| **deadline** | 截止日期，用户手动设置 | **只能用户手动修改** |

### 约束规则

| 规则 | 说明 |
|------|------|
| Arrange 范围 | 只对 `deadline - schedule_date > 24hr` 的任务进行调度 |
| Arrange 调整范围 | 只能把 schedule_date 往前（更早）调整 |
| Deadline 不可改 | deadline 只能用户手动修改，系统调度不能改 |
| Overdue 约束 | 只修改 schedule_date，且新值 ≤ deadline |

## 5.2 两层调度架构

```
┌─────────────────────────────────────────────────────────┐
│ 第一层调度：Arrange                                     │
│ 触发：每日固定时间 / 手动                               │
│ - 跨日任务安排，重新计算 schedule_date                  │
│ - 范围：当前周 + 下一周 pending 任务                   │
│ - 约束：只对 deadline-schedule_date > 24hr 的任务生效  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ 第二层调度：Daily Settlement                            │
│ 触发：每次打开 App / 每 30 分钟                        │
│ - 当日任务排序，不改变任务属性                         │
│ - 判定当前任务                                         │
└─────────────────────────────────────────────────────────┘
```

## 5.3 Arrange（跨日安排）

### 目的
把任务分配到合适的日期，重新计算 schedule_date

### 触发时机
- 每日固定时间（如 6:00）
- 手动触发

### 任务范围
- 当前周 + 下一周的所有 pending 任务
- 向后跨周（不超过下下周）
- **前提条件**：`deadline - schedule_date > 24hr`

### 调度逻辑

```
输入：
- 当前周 + 下一周的 pending 任务
- 课表（各天的课程安排）
- 时间容器配置

前置条件检查：
- 只有 deadline - schedule_date > 24hr 的任务才参与调度

处理：
1. 遍历 pending 任务（满足前置条件）
2. 在 [today, deadline - 24hr] 窗口内查找匹配日期
3. 匹配规则：
   a. 如果当天课表有对应学科：
      - 时间容器未满 → 安排到学习时间容器
      - 时间容器已满：
        - P1/P2 → 安排到自由时间容器
        - P3/P4 → 安排到下一个学科日
   b. 如果当天没有对应学科（非学科日）：
      - P1/P2 → 安排到自由时间容器
      - P3/P4 → 安排到下一个学科日
4. 确定任务的 schedule_date

注意：只修改 schedule_date，不改变 deadline
```

## 5.4 Daily Settlement（当日排序）

### 目的
调整当日任务列表顺序，判定当前任务

### 触发时机
- 每次打开 App
- 每 30 分钟定时触发

### 任务范围
- 当日 scheduled_date = today 的 pending 任务

### 处理逻辑

```
输入：
- 当日 scheduled_date = today 的 pending 任务

处理：
1. 按优先级重新排序（P1 > P2 > P3 > P4）
2. 判定当前任务（队列第一个 pending 任务）
3. 不修改任何任务属性

输出：
- 排序后的任务列表
- 当前应该执行的任务
```

### 任务优先级排序

| 优先级 | 说明 |
|--------|------|
| P1 | 紧急任务，最优先 |
| P2 | 重要任务 |
| P3 | 一般任务 |
| P4 | 可延后任务 |

## 5.5 Habit 规则

```
- 不参与 Arrange
- 不参与 Daily Settlement
- 只呈现、提醒和记录做没有做
```

## 5.6 overdue 处理

### 定义
overdue 不是独立状态，而是条件：`deadline < now && status != completed`

### 实时计算
```
isOverdue = task => 
  task.deadline && 
  task.deadline < now && 
  task.status !== 'completed';
```

### Overdue 操作（延后）
- **入口**：当下任务视图展开卡片
- **可修改字段**：只改 schedule_date
- **约束**：新 schedule_date ≤ deadline
- **不涉及**：不修改 deadline，不修改状态

---

## 第六部分：Module 4 - 触发器与提醒

Module 4 负责处理外部事件触发的提醒和任务创建，包括 Gmail 邮件解析和其他外部事件源。

## 6.1 模块概述

```
┌─────────────────────────────────────────────────────────┐
│                    触发源                               │
│  - Gmail 邮件解析                                       │
│  - Calendar 事件                                       │
│  - 外部 API / Webhook                                  │
│  - 定时任务                                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    触发器引擎                            │
│  - 事件解析                                            │
│  - 任务创建                                            │
│  - 提醒生成                                            │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    输出                                 │
│  - Task（待确认）                                      │
│  - Reminder（提醒通知）                                │
└─────────────────────────────────────────────────────────┘
```

## 6.2 Reminder 模型

```typescript
interface Reminder {
  id: UUID;
  title: string;
  trigger_time: DateTime;       // 触发时间
  type: Enum;                  // DEADLINE / HABIT / SCHEDULE / CUSTOM
  
  // 关联
  task_id?: UUID;              // 关联任务（可选）
  habit_id?: UUID;             // 关联习惯（可选）
  
  // 状态
  status: Enum;                // PENDING / TRIGGERED / DISMISSED
  created_at: DateTime;
}
```

### Reminder 类型

| 类型 | 说明 | 触发时机 |
|------|------|----------|
| DEADLINE | 任务截止提醒 | 截止前 N 分钟/小时 |
| HABIT | 习惯提醒 | 定时（如每晚 21:00） |
| SCHEDULE | 日程提醒 | 容器开始前 |
| CUSTOM | 自定义提醒 | 用户设定的时间 |

## 6.3 Gmail 邮件解析

### 触发条件

```
- 发件人：学校域名或指定导师邮箱
- 关键词：截止日期、作业、考试等
- 时间：每 30 分钟扫描
```

### 解析流程

```
Gmail 扫描 → LLM 解析 → 生成 Task → 进入待确认状态
```

### LLM 解析输出

```typescript
interface ParsedEmail {
  task_title: string;           // 任务标题
  deadline: DateTime;            // 截止时间
  estimated_duration: number;    // 预估时长（分钟）
  subject?: string;             // 学科
  priority?: Enum;              // 优先级
  description?: string;          // 额外描述
}
```

### 任务创建

```
解析成功 → 创建 Task（状态 = PENDING）
         → 写入 IB-Inbox 列表
         → 推送确认通知给用户
```

## 6.4 提醒生成规则

### 任务截止提醒

| 优先级 | 提醒时机 |
|--------|----------|
| P1 | 截止前 1 小时 |
| P2 | 截止前 4 小时 |
| P3 | 截止前 1 天 |
| P4 | 截止前 1 天（仅一次） |

### 习惯提醒

```
- 用户设定提醒时间
- 定时推送通知
- 点击完成 / 跳过
```

### 容器开始提醒

```
- 容器开始前 15 分钟提醒
- 提醒内容：当前容器名称 + 剩余任务数
```

## 6.5 外部事件集成

### Calendar 事件同步

```
- Layer 0 事件自动同步为 Reminder
- 事件开始前提醒
```

### Webhook / API

```
- 第三方工具触发任务创建
- 示例：Notion、Todoist 导入
```

---

## 第七部分：架构哲学

## 7.1 意图架构

```
┌─────────────────────────────────────────────────────┐
│                  用户意图层                           │
│  "本周我要完成3次背单词"                              │
│  "这本书我要在月底前读完"                             │
└─────────────────────────────────────────────────────┘
                          ↓ 意图
┌─────────────────────────────────────────────────────┐
│                  系统执行层                           │
│  基于时间容器容量、优先级、Slack 自动分配             │
│  具体执行时间由算法决定                              │
└─────────────────────────────────────────────────────┘
```

## 7.2 确定性位移

| 维度 | 传统模式 | 本系统模式 |
|------|----------|-----------|
| 时间 | 确定 | 灵活 |
| 内容 | 灵活 | 确定 |

## 7.3 核心承诺

| 层级 | 承诺 |
|------|------|
| 用户 | 定义"做什么、做多少" |
| 系统 | 基于时间容器决定"什么时候做" |

---

## 第八部分：系统结构设计

## 8.1 模块化架构原则

**设计目标**：模块独立运行，无直接依赖，基于 Google 数据持久层关联

```
┌─────────────────────────────────────────────────────────┐
│                 Google 数据持久层                        │
├─────────────────────────────────────────────────────────┤
│  Google Tasks      │  Google Calendar   │  Google Sheets│
│  - Tasks 数据      │  - 容器/日程        │  - 日志/配置  │
└─────────────────────────────────────────────────────────┘
         ↑                      ↑                  ↑
         │                      │                  │
    ┌────┴─────┐         ┌─────┴─────┐      ┌────┴────┐
    │          │         │           │      │         │
┌───▼───┐  ┌──▼────┐  ┌──▼────┐  ┌───▼────┐ │         │
│Tasks  │  │Calendar│  │Scheduler│ │Dashboard│         │
│Module │  │Module │  │(Framework)│ │Module  │         │
└───────┘  └───────┘  └─────────┘ └─────────┘         │
    │          │              │            ↑
    │          │              │            │
    └──────────┴──────────────┴────────────┘
              数据驱动协同
```

## 8.2 模块定义

| 模块 | 职责 | 核心功能 | 数据源 |
|------|------|----------|--------|
| **Framework** | 公用逻辑 | 鉴权、数据存储、调度引擎、事件监听 | - |
| **Tasks Module** | 任务管理 | 任务 CRUD、看板视图、Habit 管理 | Google Tasks |
| **Calendar Module** | 日历与容器 | 时间容器配置、日程查看 | Google Calendar |
| **Dashboard Module** | Focus界面 | 当下任务展示、番茄钟、Up Next | Google Tasks + Calendar |
| **Settings Module** | 系统配置 | 配置管理、初始化、用户设置 | Google Sheets |
| **Reminder Module** | 触发与提醒 | Gmail 解析、Reminder 生成 | Gmail + Sheets (待定) |

## 8.3 模块依赖关系

```
Framework (框架层)
├── auth/           - 鉴权模块
├── storage/        - 数据存储封装
│   ├── tasks.ts    - Google Tasks API
│   ├── calendar.ts - Google Calendar API
│   └── sheets.ts   - Google Sheets API
├── scheduler/       - 调度引擎
│   ├── arrange.ts  - Arrange 调度
│   └── dailySettlement.ts
└── watcher/        - 数据变更监听

独立模块（无直接依赖，通过数据层关联）
├── dashboard/      - Focus Dashboard
├── tasks/         - 任务管理
├── calendar/      - 日历容器
├── settings/      - 系统配置与初始化
└── reminder/      - 触发器与提醒（待定）
```

## 8.4 目录结构

```
TimelineMg/
├── framework/                    # 框架层（公用）
│   ├── auth/                    # 鉴权模块
│   ├── storage/                 # 数据存储
│   │   ├── tasks.ts             # Tasks API 封装
│   │   ├── calendar.ts          # Calendar API 封装
│   │   └── sheets.ts            # Sheets API 封装
│   ├── scheduler/               # 调度引擎
│   │   ├── arrange.ts
│   │   └── dailySettlement.ts
│   ├── watcher/                 # 数据变更监听
│   └── utils/                   # 公共工具
│
├── modules/
│   ├── dashboard/               # Dashboard 模块
│   │   ├── ui/
│   │   │   ├── focus.html
│   │   │   ├── upnext.html
│   │   │   └── tomato.html
│   │   ├── services/
│   │   └── manifest.json
│   │
│   ├── tasks/                  # Tasks 模块
│   │   ├── ui/
│   │   ├── services/
│   │   └── manifest.json
│   │
│   ├── calendar/               # Calendar 模块
│   │   ├── ui/
│   │   ├── services/
│   │   └── manifest.json
│   │
│   ├── settings/              # Settings 模块
│   │   ├── ui/
│   │   │   └── settings.html
│   │   ├── services/
│   │   │   ├── configService.ts
│   │   │   └── initService.ts
│   │   └── manifest.json
│   │
│   └── reminder/              # Reminder 模块（待定）
│       ├── services/
│       └── manifest.json
│
├── shared/                    # 共享类型定义
│   └── types/
│
└── appsscript.json            # 根配置
```

## 8.5 模块间通信

**方案**：基于数据变更 Watcher，无独立事件总线

```
数据变更流程：
1. 用户在 Tasks Module 完成一个任务
2. Google Tasks 状态变为 completed
3. Dashboard Module 通过 Watcher 检测到变更
4. 自动更新 UI

Watcher 监听：
- Google Tasks 变更 → 通知 Dashboard 更新
- Google Calendar 变更 → 通知相关模块
```

## 8.6 模块清单 (manifest.json)

```typescript
interface ModuleManifest {
  module_id: string;
  module_name: string;
  version: string;
  dependencies: string[];      // 仅限 framework
  entry_point: string;         // 入口 HTML
  triggers: TriggerConfig[];   // 定时触发器
  permissions: string[];      // 需要的权限
}
```

## 8.7 部署方案

**当前**：Google Apps Script Web App

```
TimelineMg (主项目)
├── Web App 部署
│   ├── 主入口 → Focus Dashboard
│   ├── /tasks → 任务管理
│   ├── /calendar → 日历配置
│   └── /reminder → 提醒设置
│
└── 未来扩展
    └── Google Workspace Add-on
        ├── Calendar 侧边栏
        └── Gmail 侧边栏
```

---

## 第九部分：待细化内容

## 8.1 调度相关（待细化）

| 内容 | 状态 | 优先级 |
|------|------|--------|
| 容器容量计算 | 待设计 | P1 |
| Arrange 与课表的具体集成方式 | 待设计 | P1 |
| 防御翻转阈值配置 | 待设计 | P1 |

## 8.2 UI相关（后续设计）

| 模块 | 内容 | 优先级 |
|------|------|--------|
| Module 1 | 日历与日程配置界面 | P2 |
| Module 2 | Planner 看板视图 | P2 |
| Module 3 | Focus Dashboard | P2 |
| Module 4 | 触发器与提醒界面 | P2 |

## 8.3 其他模块

| 模块 | 状态 | 备注 |
|------|------|-------|
| Chrome Extension | V4有规划 | 后续迭代 |
| Webhook / API 集成 | 待设计 | P2 |

---

## 第九部分：Open Questions

| 优先级 | 问题 | 状态 |
|--------|------|------|
| P1 | Module 1 时间容器配置界面 | 🔄 UI设计阶段 |
| P1 | Module 2 Planner 看板视图 | 🔄 UI设计阶段 |
| P1 | Module 3 Focus Dashboard | 🔄 UI设计阶段 |
| P2 | Module 4 触发器与提醒界面 | 🔄 UI设计阶段 |

---

## 第十部分：遗留问题 (Tech Debt)

| 编号 | 问题 | 说明 | 状态 |
|------|------|------|------|
| TD-001 | 习惯定义与实现 | Habit Task 的完整定义、completed_count 逻辑、streak 计算等 | 🔄 后续处理 |
| TD-002 | 例行任务模板 → Habit Task 的转换机制 | TaskTemplate 如何生成 Habit Task 实例 | 🔄 后续处理 |

---

## 附录：参考文档

| 文档 | 说明 |
|------|------|
| IB_AMS_v4.docx.md | 系统设计主文档 |
| WORKSTUDIO_ROLE.md | AI 角色提示词模板 |

---

**最后更新**: 2026-03-31
**状态**: 概念设计核心部分完成

---

## 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.5 | 2026-03-31 | 调度机制简化：Daily Settlement 只排序不改属性；移除 overdue 状态；overdue 只改 schedule_date；明确 schedule_date 与 deadline 概念 |
| v1.4 | 2026-03-30 | 初始版本 |

