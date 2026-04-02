# Framework 模块详细设计

## 1. 框架层概述

Framework 是系统的公用逻辑层，为所有功能模块提供基础设施服务。

```
┌─────────────────────────────────────────────────────────┐
│                    Framework 层                          │
├─────────────────────────────────────────────────────────┤
│  auth/        - 鉴权与用户管理                           │
│  storage/     - 数据存储抽象层                           │
│  scheduler/   - 调度引擎                                │
│  watcher/     - 数据变更监听                            │
│  utils/       - 公共工具                                │
│  types/       - 类型定义                                │
└─────────────────────────────────────────────────────────┘
```

---

## 2. auth/ 鉴权模块

### 2.1 功能

- Google OAuth 2.0 认证
- 用户会话管理
- 权限控制

### 2.2 文件结构

```
auth/
├── auth.ts          # 主入口，认证逻辑
├── user.ts          # 用户信息获取
└── permissions.ts   # 权限检查
```

### 2.3 核心函数

```typescript
// auth.ts
function doGet(e: doGetEvent): HtmlOutput {
  // 处理 Web App 入口
}

function getAuthUrl(): string {
  // 获取 OAuth URL
  return OAuth2.createService('IB-AMS')
    .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
    .setTokenUrl('https://oauth2.googleapis.com/token')
    .setClientId(CLIENT_ID)
    .setScope([
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/spreadsheets'
    ])
    .getAuthorizationUrl();
}

function isAuthenticated(): boolean {
  // 检查是否已认证
}

function getCurrentUser(): User | null {
  // 获取当前用户信息
}
```

---

## 3. storage/ 数据存储层

### 3.1 功能

- 封装 Google Tasks API
- 封装 Google Calendar API
- 封装 Google Sheets API
- 提供统一的数据操作接口

### 3.2 文件结构

```
storage/
├── tasks.ts       # Tasks API 封装
├── calendar.ts    # Calendar API 封装
├── sheets.ts      # Sheets API 封装
└── base.ts        # 基础抽象类
```

### 3.3 Tasks 存储

```typescript
// storage/tasks.ts

interface TaskStore {
  // 列表操作
  getTaskLists(): TaskList[];
  getOrCreateList(listName: string): TaskList;
  
  // 任务 CRUD
  getTasks(listId: string, options?: TaskQueryOptions): Task[];
  getTask(taskId: string): Task | null;
  createTask(listId: string, task: TaskInput): Task;
  updateTask(taskId: string, updates: TaskUpdates): Task;
  deleteTask(taskId: string): void;
  
  // 特殊操作
  moveTask(taskId: string, newListId: string): Task;
  completeTask(taskId: string): Task;
}

interface TaskQueryOptions {
  showCompleted?: boolean;
  dueMax?: Date;
  dueMin?: Date;
  updatedMin?: Date;
}

interface TaskInput {
  title: string;
  notes?: string;
  due?: Date;
  status?: 'needsAction' | 'completed';
}

interface TaskUpdates {
  title?: string;
  notes?: string;
  due?: Date;
  status?: 'needsAction' | 'completed';
}
```

**Google Tasks 数据模型映射**：

| Google Tasks 字段 | 系统字段 | 说明 |
|------------------|----------|------|
| id | id | 唯一标识 |
| title | title | 任务标题 |
| notes | notes (JSON) | 扩展属性（JSON 封装） |
| due | deadline | 截止日期 |
| status | status | 状态 |
| (无) | plan_id | notes JSON 中 |
| (无) | bucket | notes JSON 中 |
| (无) | is_habit | notes JSON 中 |
| (无) | subject | notes JSON 中 |
| (无) | priority | notes JSON 中 |

### 3.4 Calendar 存储

```typescript
// storage/calendar.ts

interface CalendarStore {
  // 日历操作
  getCalendars(): Calendar[];
  getOrCreateCalendar(calendarName: string): Calendar;
  
  // 事件 CRUD
  getEvents(calendarId: string, timeMin: Date, timeMax: Date): CalEvent[];
  getEvent(eventId: string): CalEvent | null;
  createEvent(calendarId: string, event: EventInput): CalEvent;
  updateEvent(eventId: string, updates: EventUpdates): CalEvent;
  deleteEvent(eventId: string): void;
  
  // 容器操作
  getContainers(): TimeContainer[];
  createContainer(config: ContainerConfig): TimeContainer;
  updateContainer(containerId: string, config: ContainerConfig): TimeContainer;
  deleteContainer(containerId: string): void;
}

interface EventInput {
  summary: string;
  start: Date;
  end: Date;
  description?: string;
  colorId?: string;
}

interface ContainerConfig {
  name: string;
  startTime: string;  // "18:30"
  endTime: string;    // "21:30"
  repeat: 'daily' | 'weekday' | 'weekend' | 'custom';
  daysOfWeek?: number[];
}
```

**时间容器标记规范**：

```typescript
// 容器事件标题格式：[Container] {name} ({start}-{end})
// 示例：[Container] 学习时间 (18:30-21:30)

// 描述字段格式：
const containerDescription = `
类型: 时间容器
分类: 学习时间
时间窗口: 18:30-21:30
防御等级: Soft
container_id: ${containerId}
`;
```

### 3.5 Sheets 存储

```typescript
// storage/sheets.ts

interface SheetsStore {
  // 工作表操作
  getOrCreateSpreadsheet(spreadsheetName: string): Spreadsheet;
  getSheet(spreadsheetId: string, sheetName: string): Sheet;
  
  // 数据操作
  readRange(spreadsheetId: string, range: string): any[][];
  writeRange(spreadsheetId: string, range: string, values: any[][]): void;
  appendRow(spreadsheetId: string, sheetName: string, values: any[]): void;
}
```

**用途**：
- 调度日志记录
- 习惯完成统计
- 健康度监控数据
- 任务延期记录

---

## 4. scheduler/ 调度引擎

### 4.1 功能

- Arrange：跨期任务安排
- daily_settlement：当日动态调度
- 防御翻转：紧急任务处理
- 动态愈合：延期任务处理

### 4.2 文件结构

```
scheduler/
├── scheduler.ts     # 调度器入口
├── arrange.ts       # Arrange 调度
├── dailySettlement.ts  # 当日调度
├── defensive.ts     # 防御翻转
├── heal.ts          # 动态愈合
└── utils.ts         # 调度工具
```

### 4.3 调度器入口

```typescript
// scheduler/scheduler.ts

interface SchedulerConfig {
  arrangeTrigger: 'manual' | 'auto';
  dailyInterval: number;  // 分钟
}

class Scheduler {
  private config: SchedulerConfig;
  private taskStore: TaskStore;
  private calendarStore: CalendarStore;
  
  constructor(config: SchedulerConfig, stores: Stores) {
    this.config = config;
    this.taskStore = stores.tasks;
    this.calendarStore = stores.calendar;
  }
  
  // 运行全部调度
  runAll(): SchedulerResult {
    const results = {
      arrange: this.runArrange(),
      daily: this.runDailySettlement(),
      defensive: this.runDefensiveCheck(),
      heal: this.runHealIfNeeded()
    };
    return results;
  }
  
  // 运行 Arrange
  runArrange(): ArrangeResult { ... }
  
  // 运行当日调度
  runDailySettlement(): DailyResult { ... }
}
```

### 4.4 Arrange 调度

```typescript
// scheduler/arrange.ts

interface ArrangeInput {
  startDate: Date;
  endDate: Date;
}

interface ArrangeResult {
  scheduled: Task[];
  skipped: Task[];
  errors: string[];
}

function runArrange(input: ArrangeInput): ArrangeResult {
  // 1. 获取有待安排的任务
  const tasks = getTasksNeedingSchedule(input.startDate, input.endDate);
  
  // 2. 获取课表
  const schedule = getClassSchedule(input.startDate, input.endDate);
  
  // 3. 获取容器容量
  const containers = getContainerCapacity(input.startDate, input.endDate);
  
  // 4. 遍历安排
  const results = tasks.map(task => {
    const matchedDate = findBestMatchDate(task, schedule, containers);
    if (matchedDate) {
      assignToContainer(task, matchedDate);
      return { task, status: 'scheduled', date: matchedDate };
    } else {
      return { task, status: 'skipped', reason: 'no capacity' };
    }
  });
  
  return results;
}
```

### 4.5 daily_settlement

```typescript
// scheduler/dailySettlement.ts

function runDailySettlement(date: Date = new Date()): DailyResult {
  // 1. 获取当日任务
  const todayTasks = getTasksForDate(date);
  
  // 2. 检查时间推移
  const currentTask = getCurrentTask(todayTasks);
  if (currentTask && isOverdue(currentTask)) {
    advanceToNextTask(currentTask);
  }
  
  // 3. 重新排序
  const sortedTasks = sortTasksByContainerRules(todayTasks);
  
  // 4. 检查溢出
  const overflowTasks = checkContainerOverflow(sortedTasks);
  if (overflowTasks.length > 0) {
    triggerArrangeForOverflow(overflowTasks, date);
  }
  
  return {
    currentTask: getCurrentTask(sortedTasks),
    upNext: sortedTasks.slice(0, 3),
    overflow: overflowTasks
  };
}
```

---

## 5. watcher/ 数据变更监听

### 5.1 功能

- 监听 Google Tasks 变更
- 监听 Google Calendar 变更
- 触发模块间联动

### 5.2 文件结构

```
watcher/
├── watcher.ts      # 监听器入口
├── tasksWatcher.ts # Tasks 变更监听
└── calendarWatcher.ts # Calendar 变更监听
```

### 5.3 设计

```typescript
// watcher/watcher.ts

interface WatcherConfig {
  tasks: {
    enabled: boolean;
    pollInterval: number; // 分钟
  };
  calendar: {
    enabled: boolean;
    pollInterval: number;
  };
}

class DataWatcher {
  private config: WatcherConfig;
  private taskStore: TaskStore;
  private calendarStore: CalendarStore;
  
  constructor(config: WatcherConfig) { ... }
  
  // 启动所有监听
  start(): void {
    if (this.config.tasks.enabled) {
      startTasksWatcher();
    }
    if (this.config.calendar.enabled) {
      startCalendarWatcher();
    }
  }
  
  // 处理任务变更
  onTaskChanged(taskId: string, changeType: ChangeType): void {
    // 通知 Dashboard 更新
    // 更新 Up Next
    // 记录日志
  }
}
```

---

## 6. utils/ 公共工具

### 6.1 文件结构

```
utils/
├── logger.ts      # 日志工具
├── constants.ts   # 常量定义
├── dateUtils.ts   # 日期工具
└── validators.ts # 验证工具
```

### 6.2 常量定义

```typescript
// utils/constants.ts

// 调度配置
const SCHEDULER = {
  ARRANGE_TRIGGER: 'manual',  // 'manual' | 'auto'
  DAILY_INTERVAL: 30,         // 分钟
  HEAL_TIME: '23:00',
  DEFENSIVE_THRESHOLD: 24 * 60, // 24小时（分钟）
};

// 容器配置
const CONTAINERS = {
  LEARNING: 'learning',
  FREE: 'free',
  BEDTIME: 'bedtime',
};

// 优先级
const PRIORITY = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3',
  P4: 'P4',
};

// 状态
const TASK_STATUS = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  OVERDUE: 'overdue',
};
```

---

## 7. types/ 类型定义

### 7.1 共享类型

```typescript
// types/index.ts

// 任务
interface Task {
  id: string;
  title: string;
  description?: string;
  duration: number;
  schedule_date?: Date;
  schedule_time?: string;
  deadline?: Date;
  deadline_time?: string;
  bucket: string;
  plan_id: string;
  subject?: string;
  is_habit: boolean;
  frequency?: string;
  target_count?: number;
  completed_count?: number;
  streak?: number;
  status: string;
  priority: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

// 时间容器
interface TimeContainer {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  repeat: 'daily' | 'weekday' | 'weekend' | 'custom';
  custom_days?: number[];
}

// 计划
interface Plan {
  id: string;
  name: string;
  template_id?: string;
  created_at: Date;
}

// 提醒
interface Reminder {
  id: string;
  title: string;
  trigger_time: Date;
  type: 'deadline' | 'habit' | 'schedule' | 'custom';
  task_id?: string;
  status: 'pending' | 'triggered' | 'dismissed';
}
```

---

## 8. 模块清单格式

### 8.1 manifest.json

```json
{
  "module_id": "dashboard",
  "module_name": "Dashboard Module",
  "version": "1.0.0",
  "description": "Focus Dashboard, 任务是当下执行界面",
  "dependencies": ["framework"],
  "entry_point": "dashboard/focus.html",
  "permissions": [
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/calendar"
  ],
  "triggers": [
    {
      "function": "refreshDashboard",
      "type": "CLOCK",
      "interval": 30
    }
  ],
  "features": {
    "tomato_timer": true,
    "up_next": true,
    "focus_view": true
  }
}
```

---

## 9. 总结

Framework 层为系统提供：

| 模块 | 核心功能 | 依赖 |
|------|----------|------|
| auth | Google OAuth 认证 | Google OAuth2 |
| storage | 数据持久化 | Tasks API, Calendar API, Sheets API |
| scheduler | 任务调度 | storage |
| watcher | 数据变更监听 | storage |
| utils | 公共工具 | - |
| types | 类型定义 | - |

**部署说明**：
- Framework 作为 Apps Script 的服务层
- 所有模块共享同一个 Apps Script 项目
- 通过 doGet 分发到不同模块的 HTML 入口