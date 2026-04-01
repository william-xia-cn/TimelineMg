# 任务模块细化设计文档

**日期**: 2026-03-31
**版本**: v1.1
**状态**: 规划中

---

## 一、设计背景

### 1.1 数据层
- **持久存储**: Google Tasks API
- **同步策略**: 双向同步，本地缓存加速

### 1.2 界面参考
- **UI 范本**: Microsoft Planner
- **核心特性**:
  - 看板视图 (Board)
  - 列表视图 (List)
  - 甘特图 (Chart)
  - 桶(Bucket)分组
  - 任务详情面板

---

## 二、核心设计决策

### 2.1 存储策略

```
Google Tasks (持久层)
└── TaskList: "TasksTmMg" (唯一)
    └── tasks[] (所有任务)
        ├── title: 任务标题
        ├── due: 截止日期
        ├── status: needsAction / completed
        ├── completed: 完成时间
        ├── deleted: 软删除标记
        └── notes: JSON 字符串 (扩展字段)
```

### 2.2 数据分层

| 层级 | 存储位置 | 说明 |
|------|----------|------|
| Plan | Task.notes.plan | Plan 元数据 |
| Task | Google Tasks 实体 | 核心任务数据 |
| 扩展属性 | Task.notes | IB 元数据、调度信息等 |
| 本地缓存 | SQLite | 加速查询、离线支持 |

### 2.3 Plan 存储结构

Plan 作为**元任务**存储在 TaskList 中，区分方式：`notes.is_plan = true`

```typescript
// Task.notes JSON 结构
interface TaskNotes {
  // Plan 元数据 (is_plan = true 时)
  is_plan: true;
  plan: {
    id: string;
    name: string;
    template_id?: string;
    buckets: string[];          // Plan 下的 bucket 列表
    created_at: string;
    updated_at: string;
    is_deleted: boolean;        // Plan 软删除
  };

  // Task 数据 (is_plan = false 时)
  is_plan?: false;
  task: {
    plan_id: string;             // 归属 Plan ID
    bucket: string;             // Bucket 名称
    subject?: string;           // 学科
    
    // IB 元数据
    criteria_ref?: string;      // 评估准则
    word_count?: number;        // 字数限制
    
    // 状态
    status: 'pending' | 'in_progress' | 'completed';
    
    // 调度属性
    priority_ms: 'P1' | 'P2' | 'P3' | 'P4';
    estimated_minutes?: number;
    actual_minutes?: number;
    
    // 时间属性
    schedule_date?: string;     // 计划执行日期（由 Arrange 确定）
    start_date?: string;        // 计划开始日期
    deadline?: string;          // 截止日期 (覆盖 due)
    deadline_time?: string;     // 截止时间
    
    // 延后相关
    delayed_until?: string;      // 延后目标日期
    
    // Habit 属性
    is_habit: boolean;
    habit_config?: {
      frequency: 'daily' | 'weekly' | 'custom';
      target_count: number;
      completed_count: number;
      streak: number;
    };
  };
}
```

### 2.4 Plan 元任务示例

```
Task (Plan 元任务):
  title: "Math IA"
  notes: {
    "is_plan": true,
    "plan": {
      "id": "plan_001",
      "name": "Math IA",
      "buckets": ["选题", "实验", "分析", "反馈"],
      "created_at": "2026-03-01T00:00:00Z",
      "updated_at": "2026-03-30T00:00:00Z",
      "is_deleted": false
    }
  }
  due: null
  status: "completed"  // 用于隐藏 Plan 元任务
```

### 2.5 普通 Task 示例

```
Task (普通任务):
  title: "完成 IA 选题文档"
  due: "2026-04-15T00:00:00Z"
  status: "needsAction"
  notes: {
    "is_plan": false,
    "task": {
      "plan_id": "plan_001",
      "bucket": "选题",
      "subject": "Math",
      "criteria_ref": "A",
      "word_count": 1500,
      "priority_ms": "P2",
      "estimated_minutes": 120,
      "is_habit": false
    }
  }
```

### 2.6 Habit Task 示例

```
Task (习惯任务):
  title: "每日背单词"
  due: null  // Habit 无截止日期
  status: "needsAction"
  notes: {
    "is_plan": false,
    "task": {
      "plan_id": "plan_002",
      "bucket": "习惯",
      "subject": null,
      "priority_ms": "P3",
      "is_habit": true,
      "habit_config": {
        "frequency": "daily",
        "target_count": 1,
        "completed_count": 0,
        "streak": 5
      }
    }
  }
```

### 2.7 Bucket 存储

Bucket 不是独立实体，而是 Plan 内的字符串数组：
- Plan 元任务的 `plan.buckets` 字段
- Task 的 `task.bucket` 字段引用

### 2.8 overdue 定义

overdue 是**条件**，不是独立状态：
```
isOverdue = deadline < now && status != completed
```

| 项目 | 说明 |
|------|------|
| 计算方式 | 实时计算，不存储字段 |
| 延后操作 | 只改 schedule_date，新值 ≤ deadline |
| deadline | 只能用户手动修改 |

### 2.9 Habit 调度规则

```
- 不参与 Arrange
- 不参与 Daily Settlement
- 只呈现、提醒和记录做没有做
```

### 2.8 本地缓存 (SQLite)

```sql
-- 任务缓存表
CREATE TABLE tasks_cache (
  task_id TEXT PRIMARY KEY,
  google_task_id TEXT UNIQUE,
  title TEXT NOT NULL,
  due TEXT,
  status TEXT,                -- pending / in_progress / completed
  schedule_date TEXT,         -- 计划执行日期
  delayed_until TEXT,         -- 延后目标日期
  notes_json TEXT,
  updated_at TEXT,
  sync_status TEXT  -- synced / pending / conflict
);

-- Plan 索引表 (加速查询)
CREATE TABLE plans_index (
  plan_id TEXT PRIMARY KEY,
  google_task_id TEXT,
  name TEXT,
  buckets_json TEXT,
  is_deleted INTEGER DEFAULT 0
);

-- 调度状态表
CREATE TABLE schedule_state (
  task_id TEXT PRIMARY KEY,
  schedule_date TEXT,
  schedule_time TEXT,
  container_id TEXT,
  container_slot INTEGER
);
```

---

## 三、UI 模块规划 (Microsoft Planner 风格)

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 Search    ⚙️ 设置    ⋮⋮⋮    👤 头像                    ←全局栏  │
├─────────┬───────────────────────────────────────────┬───────────────┤
│ Planner │  我的计划 > 数学学习          [网格][板块][日历][图表][搜索] │ ←路径+视图│
│         ├───────────────────────────────────────────┤               │
│ [+创建]  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │  🏠 主页      │
│ ──────  │  │ 无日期   │ │  过去    │ │  今天    │   │  📅 日历      │
│ 我的天   │  │ +添加任务│ │ +添加任务│ │ +添加任务│   │  ✓ 任务       │
│ 我的任务 │  │          │ │ ∨已完成65│ │          │   │  📄 文档      │
│ ──────  │  │          │ │ (65)    │ │          │   │  ⚙️ 设置      │
│ 已固定   │  ├─────────┤ ├─────────┤ ├─────────┤   │               │
│ 数学学习 │  │  明天    │ │ 本周剩余 │ │  下周    │   │               │
│ 物理计划 │  │ +添加任务│ │ +添加任务│ │ +添加任务│   │               │
│ 计算机   │  │          │ │          │ │ ☐???    │   │               │
│ 中文     │  ├─────────┤ │          │ │ ☐模块考核│   │               │
│ 英语学习 │  │ 未来     │ │          │ │         │   │               │
│ 历史     │  │ +添加任务│ │          │ │         │   │               │
│ 其他课程 │  └─────────┘ └─────────┘ └─────────┘   │               │
└─────────┴───────────────────────────────────────────┴───────────────┘
     ↑                    ↑                                   ↑
   导航栏              主内容区(板块视图)                     快捷栏
```

### 3.2 左侧导航栏

| 区域 | 内容 | 操作 |
|------|------|------|
| 顶部 | Planner | Logo + 展开菜单 |
| 创建 | [+ 创建计划] | 弹出 Plan 创建对话框 |
| 快捷入口 | 我的一天、我的任务 | 聚合视图 |
| 计划列表 | 已固定 + 所有 Plan | 点击切换 / 长按固定 |

### 3.3 顶部路径与视图切换

```
路径: 我的计划 > 数学学习
视图: [网格] [板块] [日历] [图表] [列表] [搜索]
```

**视图说明**:

| 视图 | 说明 |
|------|------|
| 网格 | Bucket 分组卡片视图 |
| **板块** | 按日期分组（核心视图） |
| 日历 | 月/周历视图 |
| 图表 | 甘特图 |
| 列表 | 表格视图 |
| 搜索 | 全文搜索 |

### 3.4 板块视图 (核心)

按日期分组的任务列表：

| 板块 | 说明 |
|------|------|
| 无日期 | 没有截止日期的任务 |
| 过去 | 已过期的任务 |
| 今天 | 截止日期为今天的任务 |
| 明天 | 截止日期为明天的任务 |
| 本周剩余 | 本周剩余天数的任务 |
| 下周 | 下周的任务 |
| 未来 | 更远的任务 |

**任务卡片显示**:
```
☐ 任务标题
  ▢ 桶名称
  ▢ 截止日期
  ▢ 👤  assignee (可选)
```

### 3.5 右侧快捷栏

固定入口：
- 🏠 主页
- 📅 日历
- ✓ 任务
- 📄 文档
- ⚙️ 设置

### 3.6 顶部全局栏

- 🔍 搜索框
- ⚙️ 设置
- ⋮⋮⋮ 应用菜单
- 👤 用户头像

### 3.7 任务详情面板

```
┌─────────────────────────────────┐
│  [Icon] 任务标题            [⋮] │
├─────────────────────────────────┤
│  截止日期: [日期选择器]        │
│  开始日期: [日期选择器]        │
│  优先级:   [●○○○]             │
├─────────────────────────────────┤
│  计划:     [下拉选择]          │
│  桶:       [下拉选择]          │
│  学科:     [下拉选择]          │
│  预估时长: [输入] 分钟          │
│  完成度:   [滑动条]            │
├─────────────────────────────────┤
│  说明:                          │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  └─────────────────────────┘   │
├─────────────────────────────────┤
│  子任务:                        │
│  ☐ 子任务 1                     │
│  ☑ 子任务 2                     │
│  ☐ 子任务 3                     │
├─────────────────────────────────┤
│  [保存] [删除] [取消]          │
└─────────────────────────────────┘
```

---

## 四、功能模块拆分

### 4.1 Plan 管理

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 创建 Plan | 创建 Plan 元任务 | P0 |
| 重命名 Plan | 更新 notes.plan.name | P0 |
| 删除 Plan | 软删除 + 级联删除 Task | P0 |
| Plan 模板 | 从预设模板创建 | P1 |
| Bucket 管理 | 添加/删除 Plan 的 buckets | P0 |

### 4.2 Bucket 管理

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 创建 Bucket | 新建 bucket 分类 | P0 |
| Bucket 筛选 | 看板视图筛选 | P0 |
| Bucket 配色 | 自定义颜色 | P2 |

### 4.3 Task 管理

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 创建 Task | 新建任务 | P0 |
| 编辑 Task | 修改任务详情 | P0 |
| 删除 Task | 软删除任务 | P0 |
| 移动 Task | 跨 Bucket/Plan | P0 |
| 批量操作 | 批量移动/删除 | P1 |
| 复制 Task | 复制任务 | P2 |

### 4.4 视图切换

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 板块视图 | 按日期分组（核心） | P0 |
| 网格视图 | Bucket 分组卡片 | P0 |
| 列表视图 | 表格视图 | P0 |
| 日历视图 | 月/周历 | P1 |
| 图表视图 | 甘特图 | P2 |
| 搜索视图 | 全文搜索 | P1 |

### 4.5 左侧导航

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 创建计划 | 新建 Plan | P0 |
| 我的任务 | 聚合所有 Plan 的任务 | P0 |
| 我的一天 | 今日任务视图 | P1 |
| 计划列表 | 显示所有 Plan | P0 |
| 固定计划 | 常驻顶部 | P2 |

### 4.5 筛选与排序

| 功能 | 描述 | 优先级 |
|------|------|--------|
| 按日期筛选 | 日期范围筛选 | P0 |
| 按优先级筛选 | P1-P4 筛选 | P0 |
| 按 Bucket 筛选 | Bucket 筛选 | P0 |
| 按 Subject 筛选 | 学科筛选 | P1 |
| 排序 | 多字段排序 | P0 |

---

## 五、Google Tasks API 集成

### 5.0 初始化

```
App 启动时检查:
1. GET /users/me/lists
2. 查找 title = "TasksTmMg" 的 TaskList
3. 不存在 → POST 创建 "TasksTmMg"
4. 保存 list ID 供后续使用
```

### 5.1 核心 API

```
TaskLists
├── GET /users/me/lists
├── POST /users/me/lists
├── PUT /users/me/lists/{tasklistId}
└── DELETE /users/me/lasks/{tasklistId}

Tasks
├── GET /users/me/lists/{tasklistId}/tasks
├── POST /users/me/lists/{tasklistId}/tasks
├── PUT /users/me/lists/{tasklistId}/tasks/{taskId}
├── MOVE /users/me/lists/{tasklistId}/tasks/{taskId}
└── DELETE /users/me/lists/{tasklistId}/tasks/{taskId}
```

### 5.2 数据操作流程

```
创建 Plan:
1. 在 TasksTmMg 中创建 Task
2. notes = { is_plan: true, plan: {...} }
3. status = "completed" (隐藏元任务)
4. 写入 plans_index

创建 Task:
1. 在 TasksTmMg 中创建 Task
2. notes = { is_plan: false, task: {...} }
3. 写入 tasks_cache
4. 更新 Plan 的 buckets (如需)

查询 Tasks:
1. 优先从 tasks_cache 读取
2. 同步状态为 pending 时请求 Google Tasks API

更新 Task:
1. 更新 Google Tasks API
2. 更新本地 cache
3. 更新 schedule_state (如涉及调度)

删除 Task:
1. Google Tasks: deleted = true
2. 本地: is_deleted = true

删除 Plan:
1. Plan 元任务: notes.plan.is_deleted = true
2. Plan 下所有 Task: 软删除
```

---

## 六、设计阶段规划

### Phase 1: 数据模型与基础 UI

| 任务 | 描述 | 状态 |
|------|------|------|
| 1.1 | 定义 Google Tasks 映射模型 | ⬜ |
| 1.2 | 设计本地扩展表结构 | ⬜ |
| 1.3 | 实现 Plan CRUD | ⬜ |
| 1.4 | 实现 Task CRUD | ⬜ |
| 1.5 | 基础看板视图 | ⬜ |

### Phase 2: 视图与交互

| 任务 | 描述 | 状态 |
|------|------|------|
| 2.1 | 列表视图实现 | ⬜ |
| 2.2 | 筛选/排序功能 | ⬜ |
| 2.3 | 拖拽状态变更 | ⬜ |
| 2.4 | 任务详情面板 | ⬜ |

### Phase 3: 高级功能

| 任务 | 描述 | 状态 |
|------|------|------|
| 3.1 | 甘特图视图 | ⬜ |
| 3.2 | Plan 模板 | ⬜ |
| 3.3 | Bucket 管理 UI | ⬜ |
| 3.4 | 批量操作 | ⬜ |

---

## 七、待完善问题

| 编号 | 问题 | 说明 | 状态 |
|------|------|------|------|
| TD-001 | Plan 持久化方案 | 当前用 Task 元任务存储，可行但非最优 | 🔄 待完善 |
| TD-002 | Bucket 配色持久化 | 需确定存储位置 | 🔄 待完善 |
| TD-003 | Task 依赖关系 | 是否需要支持 | 🔄 待完善 |
| TD-004 | 离线冲突策略 | 离线模式下的数据同步 | 🔄 待完善 |

---

## 参考文档

- Microsoft Planner 功能
- Google Tasks API v1
- DESIGN_NOTES_20260330.md

---

**版本历史**:

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.1 | 2026-03-31 | 同步 Task 状态为 pending/in_progress/completed；添加 overdue 定义；添加 Habit 调度规则；添加 schedule_date 和 delayed_until 字段 |
| v1.0 | 2026-03-30 | 初始版本 |
