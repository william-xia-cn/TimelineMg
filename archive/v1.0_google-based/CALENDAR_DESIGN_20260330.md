# 日历模块细化设计

**日期**: 2026-03-30
**版本**: v1.1
**状态**: 🔄 设计进行中

---

## 一、架构概述

### 1.1 核心原则

- 以 Google 生态为基础
- 以 Google Calendar 为数据持久层
- ScheduleTmMg 子日历存储所有 IB-AMS 数据
- 调度逻辑只处理 ScheduleTmMg 子日历，不考虑外部冲突

### 1.2 数据分层

| Layer | 数据 | 存储位置 | 管理方式 |
|-------|------|----------|----------|
| Layer 0 | 外部日程（上课、KAP） | ScheduleTmMg | 用户手动配置/导入 |
| Layer 1 | 时间容器 | ScheduleTmMg | App 写入/管理 |
| Layer 2 | 任务 | Google Tasks | App 调度 |

### 1.3 子日历设计

```
用户 Google Calendar
└── ScheduleTmMg (子日历 - IB AMS 专用)
    ├── Layer 0: 外部日程
    └── Layer 1: 时间容器
```

---

## 二、认证层设计

### 2.1 认证方案

**采用 OAuth2（用户授权模式）**

| 维度 | 说明 |
|------|------|
| Scope | `https://www.googleapis.com/auth/calendar.events` |
| 刷新机制 | 使用 refresh_token 自动刷新（需 offline access） |
| 存储 | Token 加密存储在中间层 |

### 2.2 OAuth 完整流程

```
1. 用户打开 App
2. 生成 OAuth 授权 URL，包含：
   - client_id
   - redirect_uri
   - scope: https://www.googleapis.com/auth/calendar.events
   - response_type: code
   - access_type: offline  // 获取 refresh_token
3. 用户在 Google 页面授权
4. Google 回调携带 authorization_code 到 redirect_uri
5. App 后端用 code 交换 access_token + refresh_token
6. 存储 refresh_token（加密）
7. 每次请求用 refresh_token 刷新 access_token
```

### 2.3 Token 管理

| Token | 用途 | 有效期 |
|-------|------|--------|
| access_token | API 调用 | ~1 小时 |
| refresh_token | 刷新 access_token | 长期有效（除非用户撤销） |

### 2.4 优势

- 用户首次授权一次，后续自动刷新
- 符合 Google Calendar API v3 最佳实践
- 自然支持多账户切换

---

## 三、数据模型

### 3.1 Calendar 事件扩展属性

使用 `private` 扩展属性，数据仅自研 App 可见。

#### Layer 0: 外部日程

| 属性 | 字段名 | 说明 |
|------|--------|------|
| 层级 | `layer` | 固定值 `"0"` |

#### Layer 1: 时间容器

| 属性 | 字段名 | 类型 | 说明 |
|------|--------|------|------|
| 层级 | `layer` | string | 固定值 `"1"` |
| 容器ID | `container_id` | UUID | 唯一标识 |
| 容器名称 | `container_name` | string | 如 "学习时间" |
| 防御等级 | `defense` | enum | `"hard"` / `"soft"` |
| 承载类型 | `task_types` | JSON string | 白名单学科数组 |
| 挤占规则 | `squeezing_rule` | string | `"none"` / `"high_priority_only"` |
| 重复规则 | `repeat` | JSON string | 参考 Google Calendar RRULE |

#### Layer 2: 任务

任务存储在 Google Tasks，不写入 Calendar 事件。

### 3.2 事件示例

#### 时间容器事件

```javascript
{
  summary: '[Container] 学习时间',
  description: '防御等级: Soft\n承载任务: Math,Chemistry,Physics',
  start: { dateTime: '2026-03-30T18:30:00+08:00' },
  end: { dateTime: '2026-03-30T21:30:00+08:00' },
  recurrence: ['RRULE:FREQ=WEEKDAY;BYDAY=MO,TU,WE,TH,FR'],
  extendedProperties: {
    private: {
      layer: '1',
      container_id: '550e8400-e29b-41d4-a716-446655440000',
      container_name: '学习时间',
      defense: 'soft',
      task_types: JSON.stringify(['Math', 'Chemistry', 'Physics']),
      squeezing_rule: 'high_priority_only'
    }
  }
}
```

### 3.3 颜色映射 (colorId)

| 用途 | colorId | 颜色 |
|------|---------|------|
| 普通日程 | - | Google 默认 |
| 容器 | 9 | Purple |
| P1 任务 | 11 | Red |
| P2 任务 | 6 | Orange |
| P3 任务 | 5 | Yellow |
| P4 任务 | 2 | Sage |
| 已完成任务 | 10 | Gray |

---

## 四、Google Calendar API 接口封装

### 4.1 基础接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `getCalendarList()` | `calendarList.list()` | 获取用户日历列表 |
| `createCalendar(name)` | `calendars.insert()` | 创建子日历 |
| `getEvents(calendarId, params)` | `events.list()` | 获取事件 |
| `createEvent(calendarId, event)` | `events.insert()` | 创建事件 |
| `updateEvent(calendarId, eventId, event)` | `events.update()` | 更新事件 |
| `deleteEvent(calendarId, eventId)` | `events.delete()` | 删除事件 |
| `getInstances(calendarId, eventId)` | `events.instances()` | 获取重复事件实例 |

### 4.2 增量同步接口

```typescript
interface CalendarService {
  // 获取自上次同步以来的变化
  syncChanges(calendarId: string, lastSyncTime: string): Promise<SyncResult>;
  
  // 获取单个事件
  getEvent(calendarId: string, eventId: string): Promise<CalendarEvent>;
  
  // 创建重复事件（使用 RRULE）
  createRecurringEvent(calendarId: string, event: ContainerEvent): Promise<string>;
}
```

### 4.3 错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `AUTH_ERROR` | 授权失败 | 提示用户重新授权 |
| `TOKEN_EXPIRED` | Token 过期 | 自动刷新 |
| `TOKEN_REVOKED` | Token 已撤销 | 提示用户重新授权 |
| `CALENDAR_NOT_FOUND` | 日历不存在 | 提示用户创建 |
| `EVENT_NOT_FOUND` | 事件不存在 | 跳过或提示 |
| `NETWORK_ERROR` | 网络错误 | 提示重试 |
| `QUOTA_EXCEEDED` | API 配额超限 | 提示稍后重试 |

---

## 五、同步机制

### 4.1 同步策略

| 触发条件 | 同步类型 | 说明 |
|----------|----------|------|
| App 启动时 | 增量同步 | 基于 updatedMin 读取变化 |
| 用户手动触发 | 全量同步 | 强制刷新所有数据 |
| 容器配置变更 | 实时同步 | App 写入 Calendar |
| 任务调度 | 实时同步 | 任务写入 Google Tasks |

### 4.2 增量同步流程

```javascript
async function incrementalSync(lastSyncTime) {
  const events = await calendar.events.list({
    calendarId: 'schedule_tm_mg@calendar.google.com',
    updatedMin: lastSyncTime,
    showDeleted: true
  });

  for (const event of events.items) {
    const layer = event.extendedProperties?.private?.layer;

    if (layer === '1') {
      await syncContainer(event);
    }
  }

  await updateLastSyncTime(new Date());
}
```

### 4.3 同步失败处理

- **策略**: 阻塞式提示
- **流程**: 同步失败 → 显示错误弹窗 → 用户确认重试 → 再次同步
- **原则**: 必须保证一致性，否则禁止后续操作

---

## 六、本地缓存设计

### 6.1 数据存储策略

**原则：极简缓存，只存元数据**

- 完整事件数据从 Google Calendar 读取
- 本地只缓存容器元数据，用于快速匹配和同步状态

### 6.2 本地表结构

```typescript
// 容器元数据缓存
interface LocalContainer {
  id: string;                    // Calendar eventId
  series_id: string | null;      // recurringEventId（系列事件有值）
  title: string;                  // 容器名称
  start_time: string;            // "18:30"
  end_time: string;              // "21:30"
  start_date: string;            // "2026-03-30"（单次）
  end_date: string | null;       // 重复结束日期
  repeat_rule: string | null;   // RRULE 字符串（存在时为系列）
  task_types: string[];          // 承载任务类型
  defense: 'hard' | 'soft';
  squeezing_rule: 'none' | 'high_priority_only';
  layer: '0' | '1';
  last_sync: string;             // ISO 时间戳
}

// 同步状态
interface SyncState {
  last_sync_time: string;        // 上次同步时间
  calendar_id: string;          // ScheduleTmMg 日历 ID
  calendar_summary: string;      // 日历显示名称
}
```

### 6.3 存储方式

| 数据 | 存储位置 |
|------|----------|
| LocalContainer | IndexedDB（浏览器端） |
| SyncState | IndexedDB |
| Token | 内存 + 加密存储 |

---

## 七、容器 CRUD 详细逻辑

### 7.1 创建容器

```
用户填写容器信息
       ↓
App 本地生成 eventId (UUID)
       ↓
构建 CalendarEvent 对象
  - summary: "[Container] " + name
  - start: { dateTime: date + start_time }
  - end: { dateTime: date + end_time }
  - recurrence: (如有重复) RRULE 格式
  - extendedProperties.private: layer=1, container_id, task_types...
       ↓
调用 events.insert() 写入 Calendar
       ↓
成功 → 保存到本地缓存
失败 → 提示用户重试（阻塞式）
```

### 7.2 编辑容器

```
用户点击容器 → 编辑
       ↓
修改本地对象
       ↓
调用 events.update() 更新 Calendar
       ↓
成功 → 更新本地缓存
失败 → 提示用户重试
```

### 7.3 删除容器

```
用户点击容器 → 删除
       ↓
弹窗确认：
  - 删除单个？
  - 删除整个系列？（如有 recurringEventId）
       ↓
调用 events.delete() 或 events.instances().delete()
       ↓
成功 → 同步更新本地缓存
失败 → 提示用户重试
```

---

## 八、界面设计

### 8.1 界面风格

**与 Google Calendar 一致**，用户无需学习新界面。

```
┌─────────────────────────────────────────────────────────────┐
│ ◀  2026年3月  ▶                    [+ 添加]                  │
├─────────────────────────────────────────────────────────────┤
│ 一      二      三      四      五      六      日           │
├─────────────────────────────────────────────────────────────┤
│                      ┌─────────┐                            │
│         上课         │[容器]   │                            │
│                      │学习时间 │                            │
│            ┌────┐   └─────────┘                            │
│            │KAP │                  ┌─────────┐              │
│            └────┘                  │[容器]   │              │
│                                   │自由时间 │              │
│  ┌─────────┐                      └─────────┘              │
│  │[容器]   │                                                  │
│  │睡前时间 │                                                  │
│  └─────────┘                                                  │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 添加日程弹窗

```
┌─────────────────────────────────────────┐
│  添加日程                               │
├─────────────────────────────────────────┤
│  标题: [_________________________]     │
│                                         │
│  日程类型:  ○ 普通日程  ● 时间容器      │
│                                         │
│  ─────────────────────────────────────  │
│  时间容器选项: (选择"时间容器"时显示)    │
│                                         │
│  开始: [14:00]  结束: [16:00]           │
│  重复: [不重复 ▼]                       │
│       □ 重复事件                        │
│       └─ 重复选项: [每天/工作日/自定义]   │
│                                         │
│            [取消]  [保存]               │
└─────────────────────────────────────────┘
```

### 8.3 交互流程

| 操作 | 流程 |
|------|------|
| 创建普通日程 | "+添加" → "普通日程" → 填写信息 → 保存 → 写入 Calendar (layer=0) |
| 创建时间容器 | "+添加" → "时间容器" → 填写信息 → 保存 → 使用 recurrence 字段创建系列 |
| 编辑容器 | 点击容器 → 编辑 → 保存 → 更新 Calendar |
| 删除容器 | 点击容器 → 删除 → 确认 → 删除 Calendar 事件 |

### 8.4 重复选项

参考 Google Calendar 标准做法：

| 选项 | 说明 |
|------|------|
| 重复频率 | 每天 / 工作日 / 自定义 |
| 重复结束 | 永不 / 截止到某日期 / 重复N次 |

---

## 九、课表导入

- **方式**: 原生应用自己做
- **说明**: 不依赖外部服务，直接处理用户导入的课表数据

---

## 十、待细化内容

### 10.1 容器重复规则

**已决策**：App 不处理重复规则，由用户在 Google Calendar 中手动配置。

### 10.2 时间容器选项

**已决策**：目前先不实现。

### 10.3 课表导入

**已决策**：不需要 App 处理，用户直接在 Google Calendar 中导入课表。

---

## 十一、已决策项

| 编号 | 问题 | 决策 | 说明 |
|------|------|------|------|
| CD-001 | 容器重复规则 | 不实现 | 由用户在 Google Calendar 中手动处理 |
| CD-002 | 容器选项细化 | 暂不实现 | 防御等级、承载类型等 UI 细节后续迭代 |
| CD-003 | 课表导入 | 不实现 | 用户在 Google Calendar 中自行导入 |

---

## 附录：参考文档

| 文档 | 说明 |
|------|------|
| DESIGN_NOTES_20260330.md | 系统设计笔记 |
| IB_AMS_v4.docx.md | 系统设计主文档 |

---

**最后更新**: 2026-03-31
**版本**: v1.3 - 已决策项更新

---

## 版本历史

| 版本 | 日期 | 变更内容 |
|------|------|----------|
| v1.3 | 2026-03-31 | CD-001/002/003 已决策：容器重复规则由用户处理、容器选项暂不实现、课表由用户导入 |
| v1.2 | 2026-03-31 | 与 DESIGN_NOTES_20260330.md 保持一致 |
| v1.1 | 2026-03-30 | 新增认证流程、API接口、本地缓存、CRUD逻辑 |
| v1.0 | 2026-03-30 | 初始版本 |
