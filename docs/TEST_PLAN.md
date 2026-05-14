# TimeWhere 测试计划 v1.0

> 版本：v1.0  
> 覆盖范围：scheduling.js 单元测试、baseline-safety 静态检查、所有模块静态分析、手动验证检查表。
> 当前基线：Internal MVP accepted / local-first MVP。Task Date Arrange 已进入 baseline stabilization 测试目标，要求 preview / 用户确认后才写入；六小时管理检查统一由 Dashboard 入口触发，并在同一确认页处理 Arrange 变更与 ManageBac 新事件。Google Sync、background alarm、系统通知、Chrome Web Store/public release 不属于当前测试目标。

---

## 测试层级

| 层级 | 方式 | 覆盖范围 |
|------|------|----------|
| L1 单元测试 | Node.js 自动执行 | scheduling.js 纯函数与安全 helper |
| L2 静态分析 / 轻量行为测试 | 代码审查 / baseline-safety / page-flow tests | 跨文件引用、DB 字段映射、事件绑定、安全边界、统一管理确认页 pending/apply/skip 流程 |
| L3 手动验证 | 加载扩展后操作 | 渲染正确性、用户交互流 |

---

## L1：scheduling.js 单元测试用例

### TC-S-01 timeToMinutes
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `'00:00'` | `0` |
| 2 | `'01:00'` | `60` |
| 3 | `'18:30'` | `1110` |
| 4 | `'23:59'` | `1439` |
| 5 | `null` | `0` |
| 6 | `undefined` | `0` |
| 7 | `'9:05'` | `545` |

### TC-S-02 prioritySortValue
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `'urgent'` | `0` |
| 2 | `'P1'` | `0` |
| 3 | `'important'` | `1` |
| 4 | `'P2'` | `1` |
| 5 | `'medium'` | `2` |
| 6 | `'P3'` | `2` |
| 7 | `'low'` | `3` |
| 8 | `'P4'` | `3` |
| 9 | `'unknown'` | `2`（默认） |

### TC-S-03 priorityLabel
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `'urgent'` | `'P1'` |
| 2 | `'important'` | `'P2'` |
| 3 | `'medium'` | `'P3'` |
| 4 | `'low'` | `'P4'` |
| 5 | `'P1'` | `'P1'` |
| 6 | `'P4'` | `'P4'` |
| 7 | `undefined` | `'P3'` |

### TC-S-04 priorityClass
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `'urgent'` / `'P1'` | `'priority-high'` |
| 2 | `'important'` / `'P2'` | `'priority-medium'` |
| 3 | `'medium'` / `'P3'` | `'priority-low'` |
| 4 | `'low'` / `'P4'` | `'priority-low'` |

### TC-S-04B safe HTML helpers
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | markup / quotes | HTML escaped string |
| 2 | `null` | `''` |
| 3 | attribute value | escaped attribute-safe string |

### TC-S-05 getContainerLayer
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `{ layer: 1 }` | `1` |
| 2 | `{ layer: 2 }` | `2` |
| 3 | `{ layer: null, name: '学习时间' }` | `1` |
| 4 | `{ layer: null, name: '自由时间' }` | `2` |
| 5 | `{ name: '学习时间ABC' }` | `1` |
| 6 | `{ name: '自习' }` | `2`（无"学习"字） |
| 7 | `{}` | `2`（默认） |
| 8 | `{ layer: 0 }` | `0`（透传） |

### TC-S-06 getContainerCapacity
| # | 输入 | 期望输出 |
|---|------|---------|
| 1 | `{ time_start: '18:30', time_end: '21:30' }` | `180` |
| 2 | `{ time_start: '09:00', time_end: '10:00' }` | `60` |
| 3 | `{ time_start: '00:00', time_end: '23:59' }` | `1439` |
| 4 | `{ time_start: '21:30', time_end: '22:00' }` | `30` |

### TC-S-07 containerAppliesToDate
| # | container.repeat | 日期条件 | 期望 |
|---|------|---------|------|
| 1 | `'none'` | 任意 | `false` |
| 2 | `'daily'` | 任意 | `true` |
| 3 | `'weekday'` | 周一（isWeekday=true） | `true` |
| 4 | `'weekday'` | 周六（isWeekend=true） | `false` |
| 5 | `'weekend'` | 周六 | `true` |
| 6 | `'weekend'` | 周三 | `false` |
| 7 | `'weekly'`, repeat_days:[1] | 周一（dayOfWeek=1） | `true` |
| 8 | `'weekly'`, repeat_days:[1] | 周二（dayOfWeek=2） | `false` |
| 9 | `'once'`, once_date:'2026-04-15' | dateStr='2026-04-15' | `true` |
| 10 | `'once'`, once_date:'2026-04-15' | dateStr='2026-04-16' | `false` |
| 11 | `'yearly'`, yearly_month:4, yearly_dom:15 | 2026-04-15 | `true` |
| 12 | `'yearly'`, yearly_month:4, yearly_dom:15 | 2026-04-16 | `false` |

### TC-S-08 _nthWeekdayOfMonth
| # | 输入 | 期望 { dayOfWeek, nth } |
|---|------|---------|
| 1 | `'2026-04-06'`（4月第1个周一） | `{ dayOfWeek:1, nth:1 }` |
| 2 | `'2026-04-13'`（4月第2个周一） | `{ dayOfWeek:1, nth:2 }` |
| 3 | `'2026-04-01'`（周三） | `{ dayOfWeek:3, nth:1 }` |
| 4 | `'2026-04-29'`（第5个周三） | `{ dayOfWeek:3, nth:5 }` |

### TC-S-09 containerAppliesOn（便捷封装）
| # | 说明 | 期望 |
|---|------|------|
| 1 | daily 容器，任意 Date | `true` |
| 2 | weekday 容器，Date 为周一 | `true` |
| 3 | weekday 容器，Date 为周六 | `false` |

### TC-S-09B Daily Settle task-pool helpers
| # | 输入 | 期望 |
|---|------|------|
| 1 | `start_date == null` unfinished task | included |
| 2 | `start_date <= today` unfinished task | included |
| 3 | completed task | excluded |
| 4 | future `deferred_until` task | excluded |
| 5 | `getDeferredStartDate(1, referenceDate)` | tomorrow ISO date |

### TC-S-10 dailySettle — 基础场景
**场景A：无容器**
- 输入：2 个任务，0 个容器
- 期望：`activeContainer=null`，`currentTasks` 为完整排序池

**场景B：单容器，当前时间在容器内**
- 容器：18:30–21:30，layer=1
- 2 个任务（各 45min），now=19:00
- 期望：`activeContainer` = 该容器，`currentTasks.length=2`，`unassigned=[]`

**场景C：容器超容溢出**
- 容器：18:30–19:30（60min），layer=1
- 3 个任务各 30min（总 90min）
- 期望：result 中容器分到 2 个任务，`unassigned.length=1`

**场景D：优先级排序**
- 3 个任务：priority=low/urgent/medium
- 期望：sortedPool 顺序为 urgent→medium→low

**场景E：定时任务置顶**
- 2 个任务：A(priority=urgent), B(schedule_time='20:00')，now=18:00（20:00 未到）
- 期望：sortedPool[0] = B（定时未到置顶）

**场景F：逾期任务提前**
- 2 个任务同优先级：A(due_date='2026-04-10')，B(due_date='2026-04-20')，today='2026-04-15'
- 期望：sortedPool[0] = A（逾期优先）

**场景G：Layer 1 优先分配**
- Layer1 容器（18:30-21:30，180min）+ Layer2 容器（21:30-22:30，60min）
- 5 个任务各 40min（总 200min，超 Layer1 容量）
- 期望：Layer1 分配 4 个任务（160min），Layer2 分配 1 个任务（溢出）

**场景H：Layer2 溢出方向（前 vs 后）**
- Layer1（12:00-13:00），Layer2A（09:00-10:00，在 L1 之前），Layer2B（18:00-19:00，在 L1 之后）
- 任务总量溢出 Layer1
- 期望：溢出先填 Layer2A（earlier），再填 Layer2B

---

## L2：静态分析检查项

### TC-A-01 脚本加载顺序
- [ ] focus.html: icons → dexie → db → scheduling → script
- [ ] calendar.html: icons → dexie → db → scheduling → script
- [ ] popup.html: icons → dexie → db → scheduling → popup
- [ ] settings.html: icons → dexie → db → scheduling → ics → script
- [ ] tasks.html: dexie → db → state → board → sidebar → detail-panel → dialogs → script

### TC-A-02 跨文件函数引用
- [ ] focus/script.js 解构 `TimeWhereScheduling.*` 全部在 scheduling.js 中存在
- [ ] calendar/script.js 解构 `TimeWhereScheduling.*` 全部存在
- [ ] popup/popup.js 调用 `TimeWhereScheduling.*` 全部存在
- [ ] settings/script.js 调用 `window.TimeWhereScheduling.getContainerLayer` 存在

### TC-A-03 db.js addTask 字段完整性
- [ ] `start_date` 默认今日（非 null）
- [ ] `duration` 默认 45
- [ ] `schedule_time` 字段存在
- [ ] `priority` 默认 'medium'
- [ ] `progress` 默认 'not_started'

### TC-A-04 db.js addContainer 字段完整性
- [ ] `layer` 字段透传（不丢失）
- [ ] `enabled` 默认 true

### TC-A-05 事件绑定完整性（settings）
- [ ] `confirmAddContainer` 有监听器
- [ ] `cancelContainerBtn` 有监听器
- [ ] `closeContainerModal` 有监听器
- [ ] `newContainerColorPicker` color-option 点击有 active 切换
- [ ] `newContainerLayerToggle` layer-btn 点击有 active 切换

### TC-A-06 detail-panel.js 字段覆盖
- [ ] `schedule_time` 字段渲染到表单
- [ ] `duration` 字段渲染到表单
- [ ] `.detail-date` 事件处理器覆盖 schedule_time 和 duration
- [ ] duration 保存为 number（非 null）

### TC-A-07 board.js 状态标签逻辑
- [ ] `due_date < todayStr` → status-overdue 标签
- [ ] `due_date === todayStr` → status-today 标签
- [ ] `schedule_time` 存在 → status-timed 标签
- [ ] 已完成任务不显示逾期/今日截止标签

### TC-A-08 popup.js Daily Settle 路径
- [ ] `loadCurrentTask` 使用 `getAllTasks`（非 `getInProgressTask`）
- [ ] `todayContainers` 过滤逻辑正确（用 containerAppliesToDate）
- [ ] fallback 逻辑：`currentTasks[0] || sortedPool[0]`

### TC-A-09 calendar createEventCard
- [ ] source='container' + layer=1 → class='gcal-event layer-1'，实色背景
- [ ] source='container' + layer=2 → class='gcal-event layer-2'，透明背景+虚线
- [ ] source='manual' → 原有样式
- [ ] tasks 列表仅在 type='container' 时渲染

### TC-A-10 initDefaultContainers 幂等性
- [ ] 容器表非空时提前 return，不重复创建
- [ ] 创建 3 个容器：layer2(15:30-18:30) + layer1(18:30-21:30) + layer2(21:30-22:30)

### TC-A-11 Phase 2A baseline safety
- [ ] `node tests/baseline-safety.test.js` PASS
- [ ] extension HTML has no `fonts.googleapis` / `fonts.gstatic`
- [ ] `getPendingSyncLogs()` does not use `where('synced')`
- [ ] no `clearAndReseed` / `seedDemoData` in extension JS
- [ ] no duplicate `createDefaultContainers` / `createDefaultHabits`
- [ ] `extension/shared/js/test-events.html` absent; manual utility lives under `tests/manual`

---

## L3：手动验证检查表（需真实浏览器）

### MV-01 首次加载
1. 加载扩展到 Chrome
2. 打开 Focus Dashboard
3. ✅ 控制台无报错
4. ✅ 默认 3 个容器自动创建
5. ✅ 时间轴渲染正确

### MV-02 任务创建流程
1. Task Board → 快速创建任务"测试任务A"
2. ✅ 卡片出现在看板
3. ✅ `start_date` = 今日，`duration` = 45（按 settings 默认）
4. 打开详情面板
5. ✅ 定时时间、预计时长字段可见可编辑
6. 设置 schedule_time = 20:00
7. ✅ 卡片显示 "⏰ 20:00" 标签

### MV-03 Focus Dashboard 当前任务
1. 确保 19:00 有容器（学习时间 18:30-21:30）
2. 系统时间在容器内
3. ✅ 当前任务列显示容器名
4. ✅ 任务按优先级排序

### MV-04 Calendar 容器渲染
1. 打开 Calendar 周视图
2. ✅ 学习时间容器：沿用旧时间容器实色显示样式
3. ✅ 自由时间容器：浅色 + 虚线边框显示样式
4. ✅ 容器内显示分配的任务列表
5. 点击容器 → 编辑 dialog
6. ✅ layer 选择字段存在，显示正确值

### MV-05 Popup 当前任务
1. 打开 Popup
2. ✅ 显示 Daily Settle 的当前任务列表（而非 in_progress）
3. ✅ 显示容器名（如"学习时间"）
4. 点击"完成" → ✅ 任务标记完成，显示更新

### MV-06 Settings 容器管理
1. Settings → 日历 → 管理容器
2. ✅ 列表显示 3 个默认容器，带 layer badge
3. 点击"添加容器"
4. ✅ modal 打开，颜色/layer 选择可交互
5. 填写信息，点"添加"
6. ✅ 列表刷新，新容器出现
7. 点"删除"
8. ✅ 容器从列表移除

### MV-07 Settings 任务默认值
1. Settings → 任务默认值 → 修改默认任务时长为 30
2. 保存设置
3. Task Board 快速创建新任务
4. ✅ duration = 30

### MV-08 逾期标签
1. 创建任务，due_date 设为昨天
2. ✅ 卡片显示"逾期"红色标签

---

## 测试执行文件

可执行测试：

- `node tests/scheduling.test.js`
- `node tests/baseline-safety.test.js`

**最后更新**: 2026-05-15 (baseline stabilization test sync)
