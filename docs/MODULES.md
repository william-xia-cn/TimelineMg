# TimeWhere 模块详细设计

**版本**: v2.3
**日期**: 2026-04-14

> Current baseline note (2026-05-16): Internal MVP is accepted and baseline-stabilized as a local-first MVP. MatrixView import, ManageBac mapping/task-sync, Task Date Arrange, optional Google data sync v1, and local system task reminders are active baseline stabilization features. Chrome Web Store submission and public release are not current-scope features.

---

## 模块概览

| 模块 | 页面路径 | 核心功能 |
|------|----------|----------|
| Focus Dashboard | `pages/focus/focus.html` | 当前任务(Daily Settle)、日程、本周进度、消息流 |
| Task Board | `pages/tasks/tasks.html` | Plan/Bucket/Task CRUD、多视图 |
| Calendar | `pages/calendar/calendar.html` | 周/月视图、容器配置、事件管理 |
| Settings | `pages/settings/settings.html` | 初始化、本地偏好、容器管理、数据导入/导出 |
| Popup | `popup/popup.html` | 快速操作、快捷入口 |

---

## Cross-Module: Task Date Arrange

Task Date Arrange 负责决定任务“哪天做”，可更新未完成任务的本地 `start_date` 和可升级 priority。它不是后台 alarm，也不修改来源事实字段。

- 触发入口：Dashboard / Focus、Planner / Task Board、Calendar 页面打开时运行共享自动 helper；不再使用 6 小时节流。
- 自动 helper 可直接 apply 合格的本地调度变更；无变更时只写检查时间作为诊断信息。
- Popup 打开不运行自动 Arrange；Planner `my ManageBac` 的手动 `[同步]` 是 ManageBac-only 检查，不顺带执行 Arrange。
- ManageBac 新事件创建仍必须走用户确认；Arrange 的页面打开自动 apply 只覆盖本地调度字段，不自动创建来源任务。
- 学科课表匹配优先使用 `subject_in_matrixview`。同学科精确匹配允许当天课表作为候选（`>=` 初始化/当前基准日）；任意课表 fallback 仍只能使用未来日期（`>`），避免“当天任意课表”造成无意义兜底。
- 已有明确 `start_date` 且当天正好有同学科课表时，目标日期等于当前日期属于正确的无变更结果。
- Calendar / Plan 诊断快照应包含 Arrange preview，并保留 `title`、`source`、`old_start_date`、`new_start_date`、priority 等业务字段，方便判断调度原因。
- Daily Settle 的 Layer 2 仍是所有溢出任务的接收层；Task Date Arrange 不改变该语义。

---

## 模块 1: Focus Dashboard

### 1.1 定位

Focus Dashboard 是用户**每日使用的主入口**，以时间维度层层展开的方式回答"当下该做什么"。

设计理念：**行动面板**，不是信息面板。从左到右逐步放大时间尺度：
- 当下（分钟级）→ 今日/明日（小时级）→ 本周（天级）→ 外部消息（异步）

### 1.2 布局结构

左侧导航栏 + 水平排列的 4 个数据区。当前桌面主布局按四个视觉区域分配宽度：

- 当前任务：2 份
- 日程（今日 & 明日）：2 份
- 本周进度：1 份
- 消息流：1 份

也就是 Dashboard 主区域总比例为 `2:2:1:1`。桌面首屏优先可见前 `2:2:1` 部分：当前任务、日程（今日 & 明日）、本周进度；最后一个 `1`（消息流）是独立列，通过横向滚动可见。日程区域不能比当前任务明显更窄，本周进度和消息流不能被合并压缩成同一个 1 份区域，也不能为了让四列全部塞入首屏而压缩当前任务或日程。

```
┌────┬──────────┬────────────────────┬──────────┬──────────┐
│侧边│  第1列   │    第2-3列          │  第4列   │  第5列   │
│导航│ 当前任务  │ 日程(今日 & 明日)   │ 本周进度  │ 消息流   │
│    │          │                    │          │          │
│ △  │ [容器名  │  日历时间轴视图      │ 饼图统计  │ 过期警告 │
│ ■  │  87min]  │  (容器+事件渲染)    │ (完成/   │ 截止提醒 │
│ ✓  │          │                    │  进行/   │ 即将事件 │
│ 📅 │ ┌──────┐ │  GMT+8 │ 周二 │周三│  未完成) │ 完成记录 │
│ ⋯  │ │Task 1│ │  15:00 │[自由]│    │          │          │
│    │ │P1 60m│ │  18:00 │[学习]│    │ 重点任务  │          │
│ ⚙  │ │[开始]│ │  21:00 │[自由]│    │ 列表     │          │
│ 👤 │ └──────┘ │       ···         │          │          │
│    │ ┌──────┐ │                    │          │          │
│    │ │Task 2│ │                    │          │          │
│    │ └──────┘ │                    │          │          │
└────┴──────────┴────────────────────┴──────────┴──────────┘
```

| 列 | 宽度 | 数据来源 |
|-----|------|---------|
| 第1列 当前任务 | 2份 | Daily Settle 当前容器投影 |
| 第2-3列 日程 | 2份 | containers + events（今日&明日）|
| 第4列 本周进度 | 1份 | tasks（本周统计 + 重点列表）|
| 第5列 消息流 | 1份 | tasks + events（计算得出）|

### 1.3 第1列 — 当前任务（核心）

**数据驱动**：由 `dailySettle()` 纯函数计算。

**命名**：Dashboard 页面标题使用 `当前任务`，不再使用 `当下任务`。

**番茄钟**：当前 Dashboard 不显示番茄钟组件；番茄钟不是当前任务列的一部分。

**Header badge**：
- 在容器时段内 → 显示容器名 + 剩余时间（如 "学习时间 · 87min"）
- 不在容器时段内 → 显示待办数量（如 "6 项待办"）

**任务卡片**（Accordion 折叠式）：
- 第一个任务默认展开，其余折叠
- 展开内容：优先级标签(P1-P4) + 时长 + 截止日期 + 标签
- 标签类型：`逾期`（红）、`今日截止`（橙）、`19:00`（定时，蓝）

**操作按钮**：

| 操作 | 按钮 | 行为 | 触发重算 |
|------|------|------|---------|
| 开始 | `开始` | progress → in_progress | ✓ |
| 暂停 | `暂停` | progress → not_started | ✓ |
| 完成 | `完成` | progress → completed, completed_at = now | ✓ |
| 延后 | `1天` `3天` `7天` | start_date += N，任务从当日池移除 | ✓ |

操作反馈与来源任务边界：

- 每个操作都必须实际写入 IndexedDB；写入成功后刷新 Dashboard 并显示成功提示。
- 写入失败时必须显示明确错误提示，不能静默失败或只在 console 报错。
- 操作执行期间应防止重复点击，避免同一任务被连续写入。
- Focus Dashboard 运行在 Chrome extension MV3 页面中，操作按钮不得依赖 inline `onclick` / `onchange` 等 HTML handler；所有动态卡片、checkbox、modal 按钮必须使用 `data-*` action + delegated `addEventListener` 绑定。否则按钮在 extension CSP 下会表现为可点击但实际不执行。
- ManageBac 来源任务在 Focus Dashboard 中仍可执行本地状态操作：`开始` / `暂停` / `完成` 应更新 `progress` / `completed_at`。
- ManageBac 来源任务的来源字段仍只读；本地 `start_date` 可以作为 TimeWhere 内部开始日期使用，但 ManageBac 的 `due_date` / deadline 不可修改。Focus 中的 `延后` 操作不适用于 ManageBac 来源任务，不应显示为普通可点击操作；如用户通过异常路径触发，必须显示“ManageBac 来源任务不能延后”的明确提示。
- Focus Dashboard 不得把 DB 写入被拒绝表现成“操作无效”；所有失败都要以 toast / inline 状态反馈给用户。

**空状态**：
- 容器内：显示 "当前容器无任务"
- 无容器：显示 "暂无待办任务"
- 均提供「添加任务」入口

### 1.4 第2-3列 — 日程（今日 & 明日）

Google Calendar 风格的双日时间轴视图。

- 时间轴 00:00–23:00，每小时 40px
- 渲染内容：时间容器（半透明）+ 日历事件（实色）+ 当前时间红线
- 时间容器内必须显示由 Daily Settle 分配到该容器的任务列表，行为应与 Calendar 模块周视图一致。不能只显示容器名称和时间。
- Focus Dashboard 的日程列应复用 Calendar 的任务填充规则：按日期构建 task pool，执行 `dailySettle(taskPool, dayContainers, dayReferenceTime)`，并把 `settle.result.get(container.id).tasks` 渲染到对应时间容器内。
- 支持 container override/skip 机制
- 自动滚动到当前时间附近

### 1.5 第4列 — 本周进度

上半部分：饼图统计（conic-gradient）
- 已完成（绿）/ 进行中（橙）/ 未完成（红）
- 中心数字：总任务数

下半部分：本周重点任务列表
- 筛选条件：`due_date` 在本周范围内 + 未完成
- Checkbox 可直接完成任务

### 1.6 第5列 — 消息流 & 提醒

从 DB 状态计算得出的实时消息流，按紧急度排序：
1. 已过期任务（红色警告）
2. 今日截止任务（橙色警告）
3. 明日截止任务（蓝色提示）
4. 2小时内即将开始的事件
5. 24小时内已完成任务（绿色记录）

### 1.7 系统任务提醒

- 使用 Chrome system notification，不是页面内 toast。
- 使用 `notifications` / `alarms` 权限，每分钟检查一次本地任务状态。
- `schedule_time` 任务：开始前 1 分钟提醒；在 `schedule_time` 到 `schedule_time + duration` 范围内，未完成则每 15 分钟提醒一次。
- 没有 `schedule_time`、但被 Daily Settle 分配到当前时间容器的任务：在当前容器范围内，未完成则每 15 分钟提醒一次。
- 同一任务同时满足 `schedule_time` 和容器分配时，`schedule_time` 规则优先，避免双重提醒。
- Settings 提供提醒开关和手动测试提醒；提醒去重状态保存在 `chrome.storage.local`，不写入业务 IndexedDB。

### 1.8 Daily Settle 集成

```javascript
// 触发时机
DOMContentLoaded → initApp() → ensureDefaultContainers() → loadDashboardData()
任务状态变更     → loadDashboardData()   // 每次操作后重算
每 10 分钟       → loadTaskColumn()      // 定时器自动刷新

// 核心调用链
loadTaskColumn()
  → getAllTasks() + getContainers()
  → 过滤当日容器 (containerAppliesToDate)
  → dailySettle(taskPool, todayContainers, now)
  → 渲染 currentTasks
```

### 1.9 数据依赖

- 读取: `tasks`, `containers`, `events`, `plans`（IndexedDB via Dexie.js）
- 写入: `tasks.progress`, `tasks.start_date`, `tasks.completed_at`
- 首次初始化时写入: `containers`（创建默认容器）

---

## 模块 2: Task Board

### 2.1 定位

Task Board 是**任务管理中心**，提供任务的增删改查和可视化组织。

### 2.2 布局结构

```
┌─────────────────────────────────────────────────────────────┐
│  [导航栏]                                                    │
│  任务 │ [+ 新建任务] │ 筛选: [全部 ▼] [学科 ▼] [优先级 ▼]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┬──────────┬──────────┬──────────┐               │
│  │ Math     │ Chemistry│ Biology  │ EE/IA   │ ...           │
│  ├──────────┼──────────┼──────────┼──────────┤               │
│  │ ┌──────┐ │ ┌──────┐ │          │ ┌──────┐ │               │
│  │ │ HW #3│ │ │ IA   │ │          │ │ Draft│ │               │
│  │ │ P2   │ │ │ P1   │ │  空      │ │ P1   │ │               │
│  │ │ 📅4/5 │ │ │📅4/10│ │          │ │📅4/15│ │               │
│  │ └──────┘ │ └──────┘ │          │ └──────┘ │               │
│  │ ┌──────┐ │          │          │          │               │
│  │ │ Notes│ │          │          │          │               │
│  │ │ P3   │ │          │          │          │               │
│  │ └──────┘ │          │          │          │               │
│  └──────────┴──────────┴──────────┴──────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 功能详情

| 功能 | 描述 | 交互 |
|------|------|------|
| **看板视图** | 按学科分列显示任务卡片 | 拖拽移动分类 |
| **任务卡片** | 显示标题、优先级色块、截止日期、时长 | 点击展开详情 |
| **新建任务** | 打开任务创建表单 | 必填：标题、时长、学科、截止日期 |
| **筛选** | 按学科/优先级/bucket 筛选 | 下拉选择 |
| **批量操作** | 批量选择后批量删除/移动 | Checkbox 选择 |

Planner 侧栏 Plan 排序：

- `My day`, `My Tasks`, `my ManageBac` 是固定导航入口，不参与用户自定义排序。
- `PLANS` 下的具体 Plan 列表允许用户调整顺序；调整结果必须持久化，刷新页面后保持。
- 新创建 Plan 默认追加到当前 Plan 列表末尾。
- Plan 排序只改变 Planner 侧栏显示顺序，不改变任务归属、Plan 名称、Bucket、Label 或 ManageBac / MatrixView 映射关系。
- Planner 的 Group By 和 Filter 设置应保存为本地偏好；用户刷新页面、重新进入 Planner 或切换回来时，不应每次重新设置。
- Group By / Filter 偏好按视图上下文保存：具体 Plan 使用该 Plan 自己的偏好；`My day`, `My Tasks`, `my ManageBac` 使用各自独立偏好。具体 Plan 的 Bucket 分组或 Bucket 过滤不得误套到跨 Plan 聚合视图。

任务详情面板：

- 所有 Task 卡片点击后必须打开同一套详情面板结构；普通任务、MatrixView 初始化出的学科 Plan 下任务、ManageBac 来源任务不应打开外观和信息结构完全不同的页面。
- 任务详情面板必须显示任务所属 `Subject / Plan`，这是任务归属的核心信息，不能因为统一详情 layout 被删除。普通任务应显示当前 `Plan` / `Subject`；跨 Plan 视图（例如 `My Tasks`, `my ManageBac`）也必须能看出任务属于哪个学科 Plan。
- ManageBac 来源任务的差异是字段权限，不是独立详情页：来源字段只读，本地执行字段可编辑。
- ManageBac 来源任务必须同时显示 TimeWhere 归属和来源归属：`TimeWhere Subject / Plan` 来自 `plan_id` 映射后的 Plan；`Subject in ManageBac` 来自 ManageBac 原始课程 / 学科文本。两者都应只读展示，不能只显示其中一个。
- ManageBac 来源任务在 Planner 缩略任务卡上不应把 `ManageBac` 文本占用主要信息位置；该位置应显示任务所属 TimeWhere `Plan` 名称，来源身份使用右上角本地 `MB` 图标标记。
- ManageBac 来源任务只读字段包括 title / summary、description / notes 中的来源内容、due date、source UID、source URL、ManageBac subject / Subject in ManageBac、source metadata。
- ManageBac 来源任务可编辑字段至少包括 `progress` / `completed_at`；未来如允许本地备注，应明确区分 `local_notes` 与来源 description。
- 删除 ManageBac 来源任务应禁用或改为明确的“隐藏本地副本 / 取消确认”流程，不能表现成普通可删除任务。
- UI 上可显示 `ManageBac` source badge 或只读提示，但不得把 ManageBac 任务渲染成与普通任务完全不同的详情页面。

### 2.4 任务创建表单

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 标题 | 文本输入 | ✓ | 任务名称 |
| 学科 | 下拉选择 | ✓ | Math/Chemistry/... |
| 优先级 | P1-P4 选择 | ✓ | 默认 P3 |
| 预计时长 | 数字输入 | ✓ | 分钟 |
| 开始日期 | 日期选择 | | 未填写时默认等于截止日期 |
| 截止日期 | 日期选择 | ✓ | 手动新建任务必须填写 |
| Bucket | 下拉选择 | | Plan 内分类；学科 Plan 默认 `上课/作业/单元测试/阶段考试` |
| 描述 | 文本区域 | | 可选 |

快捷新增规则：

- 快捷新增必须同样遵守手动新建任务规则：`截止日期` 必填；如果 `开始日期` 未填写，保存时默认设置为同一个 `截止日期`。
- 当前分组为 `截止日期` 时，快捷新增入口应从当前列推导 `due_date`，并额外提供 `Bucket` 选择。对于无法从列推导出明确截止日期的列，用户必须在快捷入口中选择截止日期后才能创建。
- 当前分组为 `Bucket` 时，快捷新增入口应从当前列推导 `bucket_id`，并提供 `开始日期` 与必填 `截止日期`。
- 当前分组为其他类型（如 Priority / Progress / Labels）时，快捷新增入口应提供 `开始日期`、必填 `截止日期` 和 `Bucket` 选择，同时继续从当前列推导对应默认属性（如 priority / progress / labels）。
- 快捷新增不得只靠单行标题输入直接创建缺少 `due_date` 的任务；缺少必填截止日期时必须阻止创建并给出明确 UI 提示。

### 2.5 视图切换

| 视图 | 描述 | 适用场景 |
|------|------|----------|
| **看板视图** | 按学科分列 | 日常任务管理 |
| **列表视图** | 按优先级排序 | 查看紧急任务 |
| **时间视图** | 按截止日期排列 | 规划长期任务 |

### 2.6 数据依赖

- 读取: `tasks`, `settings` (IndexedDB via Dexie.js)
- 写入: `tasks` (CRUD)

---

## 模块 3: Calendar

### 3.1 定位

Calendar 是**时间结构管理中心**，管理时间容器和日程事件，支持周视图/月视图、课表导入、统一创建/编辑/删除。

### 3.2 布局结构

```
┌──────────────────────────────────────────────────────────────┐
│  [侧边导航]                                                   │
├──────────────────────────────────────────────────────────────┤
│  工具栏: [今天] [<] [>]  2026年4月7日-13日  [🔍] [?] [⚙] [周▾]│
├──────────────────────────────────────────────────────────────┤
│  全天行: GMT+08 │ 周一  │ 周二 │ 周三 │ 周四 │ 周五 │周六│周日│
│                 │[全天事件...] (可点击)                       │
├──────────────────────────────────────────────────────────────┤
│  时间轴（6:00-22:00，40px/小时）                              │
│  上午6点 ─────────────────────────────────                   │
│  上午8点 │      │[课 ]│      │[课 ]│      │    │    │       │
│  下午6点 │[学习时间        ][学习时间     ]│    │    │       │
│  下午9点 │[自由时间        ][自由时间     ]│    │    │       │
│  下午10点│[自由时间B       ][自由时间B    ]│    │    │       │
└──────────────────────────────────────────────────────────────┘
```

### 3.3 功能详情

| 功能 | 描述 | 交互 |
|------|------|------|
| **周视图** | 一周时间轴，06:00–22:00，40px/小时 | 左右切换周，`calendar_view` 持久化 |
| **月视图** | 月份网格，每格最多 3 个日程事件 | 点击日程事件 → 编辑弹窗；点击空白 → 创建弹窗 |
| **全天事件行** | 周视图顶部全天事件区域 | 显示 time_start/time_end 为 null 的日程事件 |
| **点击创建** | 点击空白时段自动填入时间 | 周视图按点击位置计算时间，月视图默认 09:00 |
| **点击编辑** | 点击任意容器/日程事件卡片 | 打开统一编辑弹窗 |
| **悬浮预览** | 鼠标悬停 300ms 后显示详情 tooltip | 包含标题、时间、重复规则或描述摘要 |
| **搜索过滤** | 工具栏搜索按钮展开输入框 | 输入关键词后淡化不匹配的事件卡片 |
| **ICS 导入** | 在 Settings 页导入课表 .ics 文件 | 按 source='timetable' 替换，不影响手动事件 |

### 3.4 统一创建/编辑弹窗

Calendar 只能有一个统一的创建 / 编辑弹窗模型。创建和编辑不是两套产品界面：编辑模式只是在同一套表单中预填已有数据，并根据对象类型显示删除 / 修改范围等额外动作。`时间容器` 与 `日程事件` 是 Calendar 中两个同级对象类型，不应把日程事件称为“单次事件”。

```
┌─────────────────────────────────────┐
│  创建/编辑日程                 [×]  │
├─────────────────────────────────────┤
│  [时间容器] [日程事件]               │  ← 仅创建时可切换；编辑时显示只读类型
│                                     │
│  名称/标题: [              ]         │
│  日期:      [2026-04-10]            │  ← 日程事件的起始日期
│  ☐ 全天事件                         │  ← 仅"日程事件"显示
│  开始: [09:00]  结束: [10:00]       │  ← 全天勾选后隐藏
│  重复: [每周周四              ▾]    │  ← 时间容器与日程事件都必须支持
│         [日][一][二][三][四][五][六]│  ← 自定义时显示
│  颜色: ● ● ● ● ●                   │
│  修改范围: [修改全部] [仅修改此次]  │  ← 编辑重复项时显示
│                                     │
├─────────────────────────────────────┤
│  [删除▾]        [取消]  [保存]      │
│   ↓ 删除菜单                        │
│   删除此次 / 删除全部               │
└─────────────────────────────────────┘
```

**重复选项**（Google Calendar 风格，基于点击日期动态生成）：
- 不重复 / 每天 / 每周周X / 每月第N个周X / 每年在M月D日 / 每个工作日 / 每个周末 / 自定义...

**术语说明**：

- `时间容器` 是可承载任务的时间结构，用于 Daily Settle 容量计算。
- `日程事件` 是 Calendar 中的实际日程项，可以是一次性或重复发生；它不承载任务容量。
- 因此 Calendar 中不应把事件仅称为“单次事件”。日程事件和时间容器一样需要重复设置。
- 创建与编辑必须复用同一套 UI 结构、字段、校验和保存逻辑。不能维护一套“创建窗口”和另一套“编辑窗口”。允许的差异仅限于：标题文案、按钮文案、删除入口、重复项修改范围、以及编辑时是否允许切换对象类型。
- 编辑已有日程时，日程性质不可修改：`时间容器` 不能改成 `日程事件`，`日程事件` 也不能改成 `时间容器`。编辑模式应显示当前类型的只读标识，不能呈现为可切换 segmented control。创建模式才允许在 `时间容器` / `日程事件` 之间切换。
- 编辑模式只读的是对象类型，不是表单属性。编辑 `时间容器` 时，名称、时间、重复、layer、颜色等普通属性必须可修改并保存；编辑 `日程事件` 时，标题、日期、全天、时间、重复、颜色等普通属性必须可修改并保存。
- 新增时间容器保存后，必须和既有时间容器使用同一套渲染样式。周视图和月视图都要按 `type='container'` 与 `layer` 区分容器样式：学习时间容器使用 layer 1 实色样式；自由时间容器使用 layer 2 浅色 / 虚线样式。月视图不能把时间容器渲染成普通日程事件样式。

**冲突检测**：保存前检查同一天的时间重叠，有冲突时弹出 confirm 确认框。

**时间校验**：结束时间必须晚于开始时间，否则显示 error toast。

### 3.5 数据依赖

- 读取: `containers`, `events`, `settings` (IndexedDB via Dexie.js)
- 写入: `containers` (CRUD), `events` (CRUD，含日程事件与 override/skip 事件)

### 3.6 待实现功能（Backlog）

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P2 | 拖拽调整 | 周视图拖动事件修改时间/日期 |
| P2 | 键盘快捷键 | N/E/Del/← → 快捷操作 |
| P2 | ICS 导出 | 导出当前日历为 .ics |
| P2 | 空状态引导 | 首次进入引导创建容器 |
| P2 | 容器可见性开关 | 工具栏切换显示/隐藏容器 |
| P3 | 日视图 | 单日详细视图 |
| P3 | 多日事件 | 跨天事件连续渲染 |
| P3 | Undo/Redo | 撤销重做 |
| P3 | 响应式布局 | 适配不同窗口宽度 |

---

## 模块 4: Settings

### 4.1 定位

Settings 是**本地优先 MVP 的系统配置中心**，包含初始化向导、本地偏好、日历容器管理、ICS 本地文件导入、JSON 数据导入/导出，以及后续 Plan 数据源配置入口。

### 4.2 页面分区

```
┌─────────────────────────────────────────────────────────────┐
│  [侧边导航]                                                   │
│  设置                                           [保存修改]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  通用                                                    ││
│  │  显示主题: [浅色模式 / 深色模式 / 跟随系统]              ││
│  │  周起始日: [周一 / 周日]                                 ││
│  │  工作时长: [25] 分钟                                     ││
│  │  背景图片: [Calm Blue / Focus Teal / Morning / Evening]   ││
│  │  头像图片: [TimeWhere / Student / School / Focus]         ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  日历                                                    ││
│  │  导入课表: [导入]                                        ││
│  │    展开后: [选择 .ics 文件] [导入]                        ││
│  │  配置时间容器: [管理]                                    ││
│  │    展开后: 容器列表 + enabled 开关 + 删除 + [添加容器]    ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Plan                                                    ││
│  │  导入 MatrixView 课表: [导入]                            ││
│  │    点击后: 打开导入 MatrixView 课表页面                   ││
│  │  配置 ManageBac 学科映射: [配置]                         ││
│  │    点击后: 打开 ManageBac 学科映射页面                    ││
│  │  ManageBac 链接: [webcal://...                    ] [保存] [同步] ││
│  │    [保存] 保存链接；[同步] 读取 ICS 并打开新增事件确认界面 ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  任务默认值                                              ││
│  │  默认任务时长: [45] 分钟                                 ││
│  │  默认优先级: [P1/P2/P3/P4]                               ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  数据管理                                                ││
│  │  导出数据: [导出]                                        ││
│  │  导入数据: [选择文件]                                    ││
│  │  重置配置: [重置]                                        ││
│  │  重新初始化: [重新引导]                                  ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

当前实现说明：

- `任务` 初始化模板区块已隐藏，避免半可用入口。
- `重新初始化` 会清除本地业务数据并重新显示初始化向导；它不是普通的设置重置。
- 当前 UI 只暴露番茄钟工作时长 `pomodoro_work`。休息时长、长休息、长休息间隔仍是数据层默认值/未来 UI，不是当前 Settings 表单项。
- 背景图片和头像图片必须使用本地固定资源，并通过 settings 表持久化保存；页面刷新或重新进入时应读取保存值，不能每次随机或重置。
- `Plan` 区块承载 MatrixView 课表导入、ManageBac 学科映射、ManageBac 链接配置与事件同步操作。
- ManageBac 任务同步使用一次配置的私有 `webcal://` / HTTPS ICS 订阅链接；同步界面不提供本地 `.ics` 文件选择。

### 4.3 初始化向导 (首次启动)

```
步骤 1/4: 欢迎
━━━━━━━━━━━━━━━━━━━━━━━━━━
欢迎使用 TimeWhere
帮助你管理 IB 学习任务和习惯
[下一步]

步骤 2/4: 日程初始化
━━━━━━━━━━━━━━━━━━━━━━━━━━
可选择创建默认容器，或打开课表导入区域
[创建默认容器] [导入课表] [跳过]

步骤 3/4: 任务初始化
━━━━━━━━━━━━━━━━━━━━━━━━━━
当前仅提示任务管理模块中配置
[跳过]

步骤 4/4: 完成
━━━━━━━━━━━━━━━━━━━━━━━━━━
设置完成！
[进入主界面]
```

### 4.4 功能详情

| 功能 | 描述 | 交互 |
|------|------|------|
| **通用设置** | 主题、周起始日、番茄钟工作时长 | Select / number input |
| **任务默认值** | 默认任务时长、默认优先级 | Number input / select |
| **容器管理** | 添加、启用/禁用、删除时间容器 | 折叠区域 + 本地 IndexedDB |
| **ICS 导入** | 本地 `.ics` 文件导入课表事件 | 按 `source='timetable'` 替换旧课表事件 |
| **Plan: MatrixView 课表导入** | 打开 MatrixView 课表导入页面 | 设计对齐项，尚未实现 |
| **Plan: 配置 ManageBac 学科映射** | 打开 ManageBac 学科映射页面 | 读取 My Classes HTML/MHTML 并保存映射 |
| **Plan: ManageBac 链接 / 事件同步** | 在 Settings Plan 区块保存链接并触发同步 | 同步后进入新增事件确认列表 |
| **Google 数据同步** | 可选连接 Google 账号进行云端持久化和跨终端同步 | 不连接也可完整使用；Drive `appDataFolder` 自动双向同步 |
| **JSON 数据导入** | 从 JSON 备份恢复数据 | 选择文件；覆盖当前数据前确认 |
| **JSON 数据导出** | 导出 JSON 备份 | 生成 `timewhere_backup_YYYY-MM-DD.json` |
| **重置配置** | 清空 settings 并恢复默认设置 | 不清业务表 |
| **重新初始化** | 清除业务数据并重新进入向导 | 高风险操作，需要确认 |

### 4.5 MatrixView 课表导入页面（设计对齐项，尚未实现）

入口：

```text
Settings → Plan → 导入 MatrixView 课表 → [导入]
```

点击后打开独立导入页面。页面顶部是文件选择与导入操作区。用户选择 MatrixView / PowerSchool 导出的格式文件后，点击 `导入` 应解析文件并在系统本地保存导入结果，供后续预览、Subject 映射、Plan 初始化和排课操作使用。当前确认的正式输入源是浏览器从 PowerSchool Matrix View 页面另存的 `My Schedule.mhtml` / HTML 页面快照，其中保留 MatrixView 页面 DOM 表格结构。PDF 文本抽取已判定不可靠，不能作为初始化学科 Plan 的正式导入源。下方显示已保存的 MatrixView 课表预览。预览区使用两个 TabView：`View By A-H Day` 保留原始 MatrixView 的 A-H Day 矩阵感；`View By Subject` 按课程聚合，方便检查每门课在不同 Day / Period 的分布。

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 导入 MatrixView 课表                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 文件: [选择 MatrixView 导出文件]  My Schedule.mhtml / .html                  │
│      [导入] [重新选择]                                                        │
│                                                                              │
│ 状态: 等待选择文件 / 正在解析并保存 / 已保存 N 条课表记录 / 导入失败原因      │
├──────────────────────────────────────────────────────────────────────────────┤
│ MatrixView 预览                                                              │
│ [View By A-H Day] [View By Subject]                                           │
│                                                                              │
│ View By A-H Day                                                               │
│ ┌─────┬──────────────┬──────────────┬──────────────┬──────────────┬───────┐ │
│ │ Day │ Terms        │ 1            │ 2            │ 3            │ 4     │ │
│ ├─────┼──────────────┼──────────────┼──────────────┼──────────────┼───────┤ │
│ │ A   │ 25-26 S2 Q4  │ Math...      │ TOK...       │ English...   │ 中文  │ │
│ │     │              │ Room...      │ Room...      │ Room...      │ Room │ │
│ ├─────┼──────────────┼──────────────┼──────────────┼──────────────┼───────┤ │
│ │ B   │ 25-26 S2 Q4  │ Physics...   │ History...   │ Computer...  │       │ │
│ └─────┴──────────────┴──────────────┴──────────────┴──────────────┴───────┘ │
│                                                                              │
│ View By Subject                                                              │
│ ┌─────────┬──────────────────────────┬────────────┬────────┬──────────────┐ │
│ │ Plan 显示名 │ Subject in MatrixView │ Teacher    │ Room   │ Day / Period │ │
│ ├─────────┼──────────────────────────┼────────────┼────────┼──────────────┤ │
│ │ Math    │ Math: Analysis & Appro...│ Ma, Yun    │ 1471   │ A1,C2,E3,H4  │ │
│ │ English │ English B Language...    │ Sears...   │ 1359   │ A3,D1,E1,G2  │ │
│ └─────────┴──────────────────────────┴────────────┴────────┴──────────────┘ │
│                                                                              │
│ [保存并初始化学科 Plan 数据]                                                  │
│                                                                              │
│ 预览列可横向滚动；课程块颜色来自 MatrixView 原始课表或按课程名稳定生成。      │
└──────────────────────────────────────────────────────────────────────────────┘
```

预览字段建议：

| 区域 | 字段 / 显示 |
|---|---|
| 顶部操作区 | 文件选择、导入、重新选择、解析状态 |
| TabView | `View By A-H Day`, `View By Subject` |
| View By A-H Day 固定列 | `Day`, `Terms`, 学年/学期/季度等元数据 |
| View By A-H Day 矩阵列 | 节次 `1`, `2`, `3`, `4`, `CT`, `DRM` 等 |
| View By Subject: `Plan 显示名` | 用户可编辑的 Plan 显示名称；默认等于完整 `Subject in MatrixView`，用户可手动简化显示名；明显不是学科但属于学校事项的行可建议填入 `Other School Plan`；用户清空时表示该课表项不参与 Plan 更新 |
| View By Subject: `Subject in MatrixView` | MatrixView 原始课程名称或课程文本，保留外部数据来源，便于核对和追溯 |
| View By Subject 其他列 | 教师、教室、出现的 A-H Day / Period 列表 |
| View By Subject 底部操作 | `导入更新学科 Plan`，打开逐项对账确认表 |
| 课程块内容 | 课程名、课程代码、教师、教室、时间/周期信息 |
| 视觉 | 保留原始 MatrixView 色块感；高密度表格；横向滚动；不做营销式卡片 |

导入行为边界：

- 该页面目前是设计目标，尚未实现。
- 解析与导入规则需要单独 spec，再交 Build&Test。
- `导入` 点击后不是只生成临时预览；必须把解析出的 MatrixView 课表数据保存到 TimeWhere 本地系统中，作为后续操作的数据来源。
- 支持的正式输入格式必须覆盖 PowerSchool Matrix View 页面另存的 `.mhtml` / `.html`。PDF 文本抽取结果不可靠，必须明确提示 unsupported 或不可靠，不能保存为正式导入结果，不能用于初始化学科 Plan。`.mime` StudentRecordExchange 不是 MatrixView 课表输入，应明确提示 unsupported。
- 导入器只能提取课表、课程、教师、教室、Day / Period、Terms 等必要字段，不应保存无关个人身份、地址、电话等隐私字段。
- `Plan.subject` 就是权威 `Subject in MatrixView`；系统不得默认自动简写或用 Plan 显示名替代。
- `Plan.name` 是用户可编辑显示名；用户可在界面中手动简化显示名，但不能改变 `Plan.subject`。
- 明显不是学科但仍属于学校事项的 MatrixView 行，例如 Community Time、Dorm Checking、Advisory / Homeroom 等，可默认建议映射到 `Other School Plan`，但这只是初始建议值。
- 用户编辑优先级最高。如果用户把某行 `Plan 显示名` 清空，则该 MatrixView 课程/区块只保留导入预览和追溯信息，不参与 Plan 更新，不创建或更新任何 Plan。
- `导入更新学科 Plan` 点击后应进入逐项对账确认表，用户确认后才保存 `Plan 显示名` 与 `Subject in MatrixView` 的映射，并更新 planner 模块中与这些 `Subject in MatrixView` 相关的 Plan 数据。
- 对账确认表字段为：选择、旧 Plan、新 Plan 显示名、`SubjectInMatrixView`、建议动作、最终动作。
- 已匹配学科默认选中，最终动作是更新显示名并保持/恢复启用；新增学科默认选中，取消选中表示不创建；旧课表缺失学科默认选中，最终动作是停用保留，取消选中表示删除该停用 Plan。
- 删除缺失旧学科 Plan 必须二次确认，并明确提示会级联删除该 Plan 下历史任务、Bucket、Label 关联。
- 这里的 `Plan` 指 Task Board / planner 模块中的任务组织单元，不是 MatrixView 课表事件或 Calendar 时间容器。
- `Bucket` 和 `Label` 都从属于具体 `Plan`。`Bucket` 用于 Plan 内任务分类，可以从初始化模板生成，但用户可在每个具体 Plan 内修改、删除、增补和排序。`Label` 当前保留为 Plan 内标签能力，但不做过多产品定义。
- 导入更新 planner Plan 数据的最小结果：每个非空且不是 `Other School Plan` 的 `Subject in MatrixView` 对应一个学科型 planner `Plan`；`Plan.name` 保存用户确认的显示名，`Plan.subject` 保存完整 `Subject in MatrixView`，并创建默认 buckets：`上课`, `作业`, `单元测试`, `阶段考试`。
- 初始化时还必须确保存在一个名为 `Other School Plan` 的 planner Plan，用于保存未来非学科但仍属于学校相关的任务；该 Plan 不属于学科 Plan，但属于本初始化流程管理，重复点击不得重复创建；其默认 buckets 为：`事项`, `活动`, `申请`, `其他`。
- 学科相关 Plan 的更新范围：MatrixView 管理的 Plan、有 `plan.subject` 的 Plan、或名称明显匹配学科名称/简称的兼容旧 Plan。当前 MatrixView 中缺失的旧学科 Plan 默认不删除，标记为停用保留；用户可在对账确认中明确选择删除；启用学科 Plan 禁止手工删除，停用学科 Plan 允许用户确认后删除。
- 对名称无法判断的 Plan，不应自动删除；应提示用户确认是否纳入清理。
- 导入更新 planner Plan 数据必须是幂等操作：重复点击不应重复创建同一 `Subject in MatrixView` 的 Plan；重复执行后，学科 Plan 集合应与当前 `Subject in MatrixView` 映射一致。
- 导入结果应进入本地 IndexedDB，不触发 Google Sync / ManageBac / remote API。
- 若导入会覆盖已有 `source='timetable'` 事件，必须在 UI 中明确提示并要求确认。

### 4.6 ManageBac 学科映射与任务同步

ManageBac 相关能力分成两个独立界面 / 动作：

1. `配置 ManageBac 学科映射`：从 ManageBac HTML 文件读取学科配置，并映射到已经由 MatrixView 初始化好的 TimeWhere 学科 Plan。
2. `ManageBac 链接 / 事件同步`：在 Settings → Plan 区块直接配置 / 使用 ManageBac ICS 链接，读取 ManageBac 事件；点击 `[同步]` 后必须打开统一的任务调整与 ManageBac 同步确认页面。新增事件必须先展示确认列表，用户选择 Plan 后才创建 ManageBac 来源 Tasks。

MatrixView 是 TimeWhere 学科 Plan 的来源。ManageBac 学科配置不能创建、删除或重命名 MatrixView 初始化出的学科 Plan，只能建立 `Subject in ManageBac` 到现有 TimeWhere `SubjectInMatrixView` / Plan 的映射。

#### 4.6.1 配置 ManageBac 学科映射

入口：

```text
Settings → Plan → 配置 ManageBac 学科映射 → [配置]
```

前置条件：

- MatrixView 课表已成功导入。
- 学科 Plan 初始化已完成。
- 已存在可映射的 TimeWhere 学科 Plan。

界面结构：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 配置 ManageBac 学科映射                                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ 文件: [选择 ManageBac HTML 文件]                                             │
│      [读取预览] [重新选择]                                                    │
│                                                                              │
│ 状态: 等待选择 / 正在读取 / 预览已生成 / 失败原因                            │
├──────────────────────────────────────────────────────────────────────────────┤
│ 学科映射预览                                                                 │
│ ┌──────────────────────────┬──────────────────────────┬────────┬──────────┐ │
│ │ Subject in ManageBac     │ TimeWhere Subject / Plan │ Teacher│ Room     │ │
│ ├──────────────────────────┼──────────────────────────┼────────┼──────────┤ │
│ │ Math: Analysis & Appro...│ [Math: Analysis ...   v] │ Ma...  │ 1471     │ │
│ │ Advisory / Homeroom      │ [Other School Plan    v] │ Chen...│ 11M      │ │
│ └──────────────────────────┴──────────────────────────┴────────┴──────────┘ │
│                                                                              │
│ [保存 ManageBac 学科映射]                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

映射规则：

- `Subject in ManageBac` 保留 ManageBac 原始课程 / 学科文本，只读，只作为来源描述和匹配辅助。
- `TimeWhere Subject / Plan` 从已有启用 MatrixView 学科 Plan 中自动匹配，用户可手动选择调整。
- 明显非学科但学校相关的项默认映射到 `Other School Plan`。
- 用户选择空值表示该 ManageBac 学科 / 来源项不参与后续任务同步。
- 保存映射只保存配置，不创建、不删除、不重命名学科 Plan，不同步 ICS 任务。

#### 4.6.2 ManageBac 链接 / 事件同步

入口：

```text
Settings → Plan → ManageBac 链接 → [保存]
Settings → Plan → ManageBac 链接 → [同步] → 任务调整与 ManageBac 同步确认页面（ManageBac-only）
Planner → My Tasks → my ManageBac
```

`ManageBac 链接` 是 Settings → Plan 区块内的直接配置项，与 `配置 ManageBac 学科映射` 并列展示，不是学科映射页面内的子步骤。`[保存]` 保存一次性 webcal/ICS 链接；`[同步]` 使用已保存链接读取 ICS，并打开独立的“任务调整与 ManageBac 同步确认”页面，但该入口只生成 ManageBac 待确认项，不顺带执行 Arrange。该页面不应复用 `配置 ManageBac 学科映射` 页面，也不应作为学科映射页面中的下级 section/hash。`my ManageBac` 是 Planner 中 `My Tasks` 下的 ManageBac 专用查看入口。它不是学科 Plan 本身，而是按来源过滤展示所有 ManageBac 来源 Tasks；每个 Task 仍通过 `plan_id` 归属于映射后的 TimeWhere 学科 Plan 或 `Other School Plan`。

Settings → Plan 区块中的入口形态：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Plan                                                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ 导入 MatrixView 课表                                              [导入]     │
│ 从 PowerSchool MatrixView 导出的 MHTML/HTML 初始化学科                      │
│                                                                              │
│ 配置 ManageBac 学科映射                                           [配置]     │
│ 读取 ManageBac My Classes 页面，建立学科到 Plan 的映射                      │
│                                                                              │
│ ManageBac 链接  [ webcal://.../student/events/<token>.ics          ] [保存] [同步] │
│ 保存一次 webcal/ICS 链接；同步后确认新增事件并添加为只读任务                │
└──────────────────────────────────────────────────────────────────────────────┘
```

点击 `[同步]` 后打开的统一管理确认页面（此入口只填充 ManageBac 新事件区域）：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 任务调整与 ManageBac 同步确认                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Arrange task 列表                                                             │
│ ┌────────────┬────────────┬────────────┬────────────┬────────────┐          │
│ │ 应用       │ Task       │ 当前日期   │ 建议日期   │ 建议优先级 │          │
│ └────────────┴────────────┴────────────┴────────────┴────────────┘          │
│                                                                              │
│ 新增 ManageBac task 列表                                                     │
│ 状态: 正在读取 ICS / 已发现 N 个新增事件 / 已更新 M 个已有任务 / 失败原因     │
│ ┌────────────┬────────────────────┬────────────────────┬──────────────────┐ │
│ │ 应用       │ Due / Summary      │ Description        │ 确认 Plan        │ │
│ ├────────────┼────────────────────┼────────────────────┼──────────────────┤ │
│ │ 2026-05-20 │ Essay Draft        │ ...                │ [English      v] │ │
│ │ 2026-05-21 │ Lab report         │ ...                │ [Biology      v] │ │
│ └────────────┴────────────────────┴────────────────────┴──────────────────┘ │
│                                                                              │
│ [确认并导入选中项]                    [全部跳过并完成]                       │
│                                                                              │
│ 已确认创建的 ManageBac 来源任务显示在 Planner → My Tasks → my ManageBac。    │
└──────────────────────────────────────────────────────────────────────────────┘
```

Planner 中 `my ManageBac` 入口：

```text
My Tasks
└─ my ManageBac
   └─ ManageBac 来源任务列表（来源内容只读，完成状态可切换）

my ManageBac 视图
├─ 标题: my ManageBac
├─ 工具栏: [同步]  最后同步时间 / 任务数量 / 失败原因
└─ ManageBac 来源任务列表
```

同步行为边界：

- `my ManageBac` 在 Planner 侧栏中是普通导航项；打开该视图不得触发 ManageBac 自动同步或顺带执行 Arrange。使用本地图标系统时，所有 `material-symbols-outlined` 名称必须有本地 SVG 映射，缺失映射导致原始图标名显示属于 UI bug。
- Planner 中的 `[同步]` 是 `my ManageBac` 视图工具栏动作，不是侧栏导航文本。点击后必须复用 Settings → Plan → ManageBac 链接 的同一条事件同步 / 新增任务确认流程，打开独立的统一管理确认页面；该手动同步只处理 ManageBac，不顺带执行 Arrange。
- Planner 发起同步不得绕过新增事件确认直接创建 ManageBac 来源任务；已存在任务可以按 ICS UID 自动更新，但新增事件仍必须由用户在确认页选择 Plan 后才创建。
- ManageBac 订阅链接本身是敏感配置，不应写入公开文档或测试 fixture；本地保存时应作为用户私有设置处理。
- ManageBac 订阅链接应一次配置并持久保存；后续手动同步使用已保存链接。未来自动同步也必须复用同一配置，除非用户主动修改链接。
- ManageBac 链接配置与事件同步不提供本地 `.ics` 文件导入选择；本地文件不是 ManageBac event sync 的产品入口。
- `配置 ManageBac 学科映射` 与统一管理确认页必须是两个独立界面。同步确认页可以读取学科映射结果，但不能承载学科映射文件读取 / 保存流程。
- 同步 ManageBac 事件前必须已经完成 ManageBac 学科映射；未完成时 `[同步]` 应禁用或给出明确阻断提示。
- ManageBac 的新增事件不自动创建任务；同步后先显示新增事件确认列表，并给出系统 Plan 建议。
- 用户在新增事件确认列表中选择 Plan 后，点击 `添加确认的任务`，才将对应事件转换为 `tasks` 表记录，通过 `plan_id` 归属到映射后的 planner `Plan`，并标注为 ManageBac 来源任务。
- ManageBac 是 Task source metadata，不是 Bucket，也不是 Label。ManageBac 来源任务仍通过 `plan_id` 归属于某个 Plan，并可通过 `bucket_id` 归入该 Plan 内的某个 Bucket。
- 用户选择空值表示该 ManageBac 事件暂不创建任务；清空已保存的事件确认应删除对应确认记录，避免旧确认误创建。
- ManageBac 来源任务的“来源内容”只读：用户不能直接修改或删除由 ICS 决定的字段，例如 title / summary、description、due date、source UID、source URL、ManageBac subject、source metadata。唯一事实来源是 ManageBac ICS 链接。
- ManageBac 来源任务的“本地执行和调度字段”可由 TimeWhere 修改：`progress` / `completed_at` 可以在 Task Board / Planner / Popup 等任务执行入口切换，`start_date` / `priority` 可以由 Task Date Arrange 调整。该状态不是 ManageBac 的事实来源字段，不能因为 `readonly` 或 source protection 被禁止。
- ManageBac 同步更新已有任务时，应保留用户本地执行和调度字段，除非 ICS 明确表达该任务取消 / 删除并按缺失事件策略处理。同步不得把用户已完成状态、TimeWhere `start_date` 或本地 priority 无故重置。
- 当前数据层不会天然区分来源内容只读与本地执行状态可写；实现时必须通过来源元数据和 Task Board / DB 写操作保护显式区分。
- 已存在的 ManageBac 来源任务按 ICS UID 自动更新，不重复要求确认，也不创建重复任务。
- 如果用户修改链接，应提示这会切换 ManageBac 数据源，并要求确认如何处理旧链接来源任务。
- 此功能读取远程 `webcal://` / HTTPS ICS 链接，属于当前 ManageBac follow-up work；实现需要窄范围扩展 extension host permission 或 background fetch relay，并保持真实 token URL 不进入 repo。
- 不涉及 Google Sync、ManageBac background alarm、系统任务提醒、CWS 或 public release readiness。

### 4.7 Google 数据同步（D-019 / D-020）

Google 数据同步是可选的数据持久化与跨终端能力，不是 TimeWhere 的登录系统。用户不配置 Google 账号时，Planner、Calendar、Dashboard、Popup、MatrixView、ManageBac、Daily Settle、Task Date Arrange、Settings 等核心功能必须完整可用。

产品边界：

- UI 名称使用 `Google 数据同步`，不使用“登录后使用”语义。
- OAuth client ID 只用于识别 TimeWhere 扩展应用；每个用户授权自己的 Google 账号。
- 同步数据写入当前用户自己的 Google Drive `appDataFolder`，开发者不托管用户数据。
- IndexedDB 是运行时主库；同步层只复制数据。
- 未连接 / 离线 / 授权失败 / token 过期时，本地功能继续工作。
- 第一版云端存储使用 Google Drive `appDataFolder`，云端主文件为 `timewhere-sync-v1.json`。
- 第一版是自动双向同步：打开 Settings / Dashboard / Planner / Calendar / Popup 时节流检查，本地写入后 30 秒 debounce 检查；不做 background alarm。
- 冲突使用非阻断确认，用户可逐项选择 `使用本地` / `使用云端` / `跳过`。
- 删除使用 tombstone，避免旧设备把已删除记录重新上传回来。
- `上传本设备数据` 与 `从 Google 恢复` 是高级危险动作，必须二次确认。
- Google email / account display 后续实现，不作为第一版必要功能。
- ManageBac ICS link 需要随 Google 数据同步一起保存，因为 Product Owner 要求跨终端保留该配置。

Settings 入口建议：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Google 数据同步                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ 状态: 本地模式 / 已连接 / 同步中 / 有冲突待处理 / 失败 / 离线待重试         │
│ [连接 Google 同步] [立即同步] [从 Google 恢复] [上传本设备数据] [断开同步]   │
│                                                                              │
│ 说明: 不连接 Google 也可以完整使用 TimeWhere。Google 仅用于跨设备数据同步。 │
└──────────────────────────────────────────────────────────────────────────────┘
```

同步确认页建议：

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Google 数据同步确认                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ 本地新增 / 云端新增 / 双端修改冲突 / 删除冲突                                │
│ 每项可选择: [使用本地] [使用云端] [跳过]                                      │
│ [确认同步选中项] [全部跳过]                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

实现阶段：

1. Chrome Identity / OAuth token 获取，Settings 显示连接状态。
2. Snapshot export/import 保留为备份 / 恢复基础能力。
3. Drive `appDataFolder` 写读。
4. 双向同步 v1：本地与云端 record-level merge，冲突进入确认。
5. 自动触发策略：页面打开节流检查 + 保存后 debounce 检查；不做 background alarm。

### 4.8 数据依赖

- 读取: `settings`, `containers`, `events` (IndexedDB via Dexie.js)
- 写入: `settings`, `containers`, `events`

---

## 模块 5: Popup

### 5.1 定位

Popup 是**快速操作入口**，用户点击工具栏图标时显示，提供即时信息和小操作。

### 5.2 布局结构

```
┌──────────────────────────────────────────────┐
│ △ TimeWhere        今日完成 3   今日待办 12  │
├──────────────────────────────────────────────┤
│ ▶ 当前任务                                    │
│ ┌──────────────────────────────────────────┐ │
│ │ ●  Task Title                         ˅  │ │
│ ├──────────────────────────────────────────┤ │
│ │ Notes / Description                     │ │
│ │ [P2] [45min] [截止 今天] [今日截止]      │ │
│ │ [开始] [完成]                            │ │
│ │ 延后   [1天] [3天] [7天]                 │ │
│ └──────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────┐ │
│ │ ●  Next Task Title                    ˅  │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [设置]                         [打开完整页面]│
└──────────────────────────────────────────────┘
```

Popup 的 `当前任务` 必须与 Dashboard `当前任务` 列保持同一数据投影、列表结构和操作语义。Popup 是 Dashboard 当前任务列的紧凑投影，不再使用独立的全局快捷操作区，也不能降级成只显示单个任务卡。

### 5.3 功能详情

| 功能 | 描述 | 交互 |
|------|------|------|
| **Header 汇总** | 显示应用名、今日完成数、今日待办数 | 只读 |
| **当前任务** | 显示 Daily Settle `currentTasks` 列表，UI 与 Dashboard 当前任务卡列表一致 | 点击开始/暂停/完成/延后 |
| **快捷入口** | 打开设置或完整 Focus 页面 | 按钮 |

Popup 当前任务规则：

- Header 右侧显示今日统计，不再单独占用统计卡片区域。建议视觉为两个轻量指标 chip：`今日完成 N` 与 `今日待办 M`。
- `今日完成 N` 只统计今天完成的任务，即 `completed_at` 日期为今天的任务。
- `今日待办 M` 只统计今天可执行的未完成任务，口径应与 Dashboard / Daily Settle 当日 task pool 一致：`start_date == null || start_date <= today`，排除 completed 和 future `deferred_until`。
- 移除独立 `快捷操作区`。`开始` / `暂停` / `完成` / `延后` 操作位于当前任务卡内部，与 Dashboard 当前任务卡一致。
- Popup 当前任务区显示 Daily Settle `currentTasks` 列表，不能只显示 `currentTasks[0]` 或 `sortedPool[0]`。
- Popup 当前任务列表的展开规则应与 Dashboard 一致：第一项或进行中任务展开；其他项可保持紧凑。
- 每个任务卡的展开内容、metadata tags、操作按钮、ManageBac 延后限制与 Dashboard 当前任务卡保持一致。
- Popup 任务卡展开后必须能完整显示当前任务的主要信息和操作区，不能因为固定高度、`max-height`、`overflow:hidden`、行数裁剪或容器滚动策略导致 notes、metadata、操作按钮、延后行显示不全。过长文本可换行或在卡片内部自然扩展；Popup 外层可以滚动。
- 无任务时显示 `暂无待办任务`，不能再写成 `暂无进行中的任务`，因为 Popup 使用的是 Daily Settle 当前任务投影，不是只读取 `in_progress`。
- ManageBac 来源任务在 Popup 中同样显示 `延后    ManageBac 来源任务不能延后`，不显示 1/3/7 天延后按钮。

### 5.4 尺寸约束

- 最大尺寸: **800×600px** (通常更小)
- 建议尺寸: **400×560px**
- 布局: 垂直滚动

### 5.5 数据依赖

- 读取: `tasks`, `containers`, `habits` (IndexedDB via Dexie.js)
- 写入: `tasks.progress`, `tasks.start_date`, `tasks.completed_at`

---

## 模块间通信

### 页面间通信

| 场景 | 通信方式 |
|------|----------|
| Popup → Page | `chrome.tabs.create()` |
| Page → Page | IndexedDB 共享数据 |
| 数据同步 | `chrome.runtime.sendMessage()` |

### 数据变更通知

由于使用 IndexedDB，各页面通过以下方式保持数据一致：

```
用户在一个页面修改了数据
        ↓
更新 IndexedDB (Dexie.js)
        ↓
页面刷新时自动读取最新数据
        ↓
其他页面刷新时获取最新数据
```

**注意**：需要定期轮询或使用 visibilitychange 事件刷新数据。

---

**最后更新**: 2026-05-15 (baseline stabilization UI sync)
**版本**: v2.3
