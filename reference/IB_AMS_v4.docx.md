**IB 学术主权管理工具**

**需求定义与系统设计  v4.0**

**三大模块 · Google 生态全局 · Apps Script 全展层 · Chrome 扩展预规划**

| 三大模块概览 Module 1: 日历与日程  ·  Module 2: Planner 任务与习惯管理  ·  Module 3: 时间线 Focus 界面 |
| :---: |

| 🗓️ Module 1 日历与日程 | Calendar & Schedule 模块 日程事件 \+ 时间容器定义；叠加 Google Calendar；处理 Gmail 科特殊事件源 |
| :---: | :---- |

| 📋 Module 2 Planner 任务与习惯 | Task & Habit Management 模块 Microsoft Planner 级别任务管理；独立页面；Google Tasks 为承载层；习惯融入控制 |
| :---: | :---- |

| ⏱️ Module 3 时间线 Focus | Timeline & Focus 模块 当下视角全屏界面；单日日历叠加动态任务；番茄钟 \+ 快速响应；Chrome 扩展预规划 |
| :---: | :---- |

  **第零部分  全局架构与技术约束**

## **0.1  技术堆栈与约束边界**

整个工具基于 Google 生态全局，所有存储、计算和展示均在 Google 中完成，无第三方服务依赖。

| 层级 | 技术组件 | 职责 | 约束 |
| :---- | :---- | :---- | :---- |
| 展示层 | Google Apps Script Web App (doGet) | 三个模块页面展示、交互逻辑 | 运行环境：Chrome / 任意浏览器；未来水展 Chrome Extension |
| 事务层 | Google Apps Script (.gs 服务端逻辑) | 调度算法、慨合、Gmail 解析、定时任务 | 6分钟/次运行限制；复杂 CSP 需另开 Cloud Run |
| 任务层 | Google Tasks API | 主任务库和习惯库的实际存储 | 每个任务列表限 10万条；不支持自定义属性（用 Notes 字段封装 JSON） |
| 日历层 | Google Calendar API v3 | 日程事件 \+ 时间容器事件存储 | 读写通过 OAuth2 / Service Account；建议创建専属 IB 日历 |
| 展层 | Google Sheets API | 慨合日志、健康度监控、历史记录 | 不适合高频读写；仅用于结算和分析 |
| 邮件源 | Gmail API \+ Gemini API | 老师邮件解析→自动建任务 | 印证最小低频率扫描（Apps Script 定时 30min） |
| 后期扩展 | Chrome Extension (Manifest V3) | 全局小工具栏 \+ 快捷操作 \+ Focus 指示板 | 尊重现有权限模型；通过 Message Passing 与 Web App 通信 |

## **0.2  核心数据分层与存储策略**

Google Tasks 不支持自定义属性，所有扩展属性（优先级、学科、耗时等）封装成 JSON 存入 Notes 字段。

| // Google Tasks Notes 字段封装规范 task.notes \= JSON.stringify({   v: 1,                          // schema 版本   type: 'task',                  // 'task' | 'habit'   subject: 'Chemistry',          // IB 学科标签   priority: 'P2',   duration\_min: 90,   container\_id: 'container\_001', // 归属时间容器   depends\_on: null,   calendar\_event\_id: null,       // 调度后填入   healed\_count: 0,   // habit-only fields   frequency: null, streak: null, status\_today: null }); |
| :---- |

## **0.3  三大模块关系与数据流**

| 数据流全局视图 Gmail 邮件  ──\[LLM 解析\]──►  Module 2 Planner  ──\[调度算法\]──►  Module 1 Calendar                                        *│                                          │*                             *Google Tasks API (任务主库)          Google Calendar API (日历主库)*                                        *│                                          │*                               *└────────▼──────────────────────────┘*                                       *Module 3 Timeline Focus*                                   *(读取两者，呈现当下任务与日历)* Google Sheets Logs: 单向接收 Module 2/3 的慨合日志和健康度指标（不参与实时读写） |
| :---- |

  **🗓️  Module 1  日历与日程模块**

## **1.1  核心定义**

Module 1 负责管理时间载体层的两类实体：事件（Event）和时间容器（Time Container）。它不管理任何待办事项，仅提供时间的结构性视图和配置能力。

## **1.2  技术实现方式决策：叠加 vs 独立页面**

| 方案 A：直接叠加 Google Calendar 🔴 无法修改 Google Calendar 内核界面 🔴 Chrome Extension 可向页面注入 DOM，但预外行为风险高 🔴 Google Calendar 更新可能破坏注入逻辑 🟡 用户无需学习新界面，习惯据点低 → 不推荐：维护成本高，可控性差 | 方案 B：独立 Web App 双向同步（推荐） ✅ 完全控制界面和交互逻辑 ✅ 通过 Calendar API 双向同步：Web App ↔ Google Calendar ✅ 天然支持未来 Chrome Extension 集成 ✅ 时间容器加层逻辑完全在自研端 ✔️ 缺点：用户需切换页面；但 Module 3 已解决“当下”问题 |
| :---- | :---- |

| 🕎 决策：采用方案 B —— 自研 Web App 为主，Google Calendar 为备份视图 • Module 1 Web App 是配置界面，不是每日操作界面。用户开学期初设好容器，日常无需进入。 • Google Calendar 作为备份可视化工具和手机查看入口。 • 时间容器通过 \[Container\] 前缀写入 Calendar，在两个界面均可见。 |
| :---- |

## **1.3  Module 1 功能设计**

### **1.3.1  事件管理**

* **课表导入：**支持批量导入 IB 课表，自动写入 Google Calendar；Layer 0 标记

* **事件查看：**展示本周/本月事件列表，区分事件与容器

* **Gmail 特殊事件源：**每 30分钟扫描老师来信 → LLM 提取任务 → 写入 Module 2；邮件展示在事件时间线上作为参考点

### **1.3.2  时间容器配置表**

这是 Module 1 的核心功能。用户在此定义全年使用的时间容器规则，算法层读取这些规则完成调度。

| 配置项 | 类型 / 选项 | 说明 |
| :---- | :---- | :---- |
| 容器名称 | String | 如《上课学习总结》 |
| 时段 | Time range (HH:MM \- HH:MM) | 如 16:00 \- 18:00 |
| 重复规则 | Daily / Weekday / Weekend / 自定义周几 | 支持多选 |
| 防御等级 | Hard / Soft | Hard \= 不可被任何任务覆盖；Soft \= 可局部弹性 |
| 承载任务分类 | 多选: 学科列表 \+ 任务类型 | 如「所有学科 \+ 笔记整理 \+ 习惯」 |
| 可挤占性 | None / 仅 P1 可挤占 / 仅 P1+P2 | 极端情况下是否允许高优先级任务侵占 |
| 处理方式 | 弹出式配置面板 | 修改后实时写入 Google Calendar |

### **1.3.3  每周/周期视图**

* 示高层布局：Layer 0 事件（不可动）→ Layer 1 容器（防御区）→ Layer 2 已调度任务（顯示填充状态）

* 容器占用率小组件：每个容器显示当周副任务填充情况，识别贯装度

* Gmail 事件在居中显示为小卡片，点击可展开解析内容并一键转化任务

## **1.4  Module 1 技术实现**

| // Apps Script: 容器写入 Google Calendar function upsertContainer(cfg) {   const cal   \= CalendarApp.getCalendarById(IB\_CAL\_ID);   const title \= \`\[Container\] ${cfg.name} (${cfg.start}-${cfg.end})\`;   const desc  \= \[     '类型: 时间容器',     \`防御等级: ${cfg.defense}\`,     \`承载任务类型: ${cfg.task\_types.join(',')}\`,     \`可挤占性: ${cfg.squeezing\_rule}\`,     \`container\_id: ${cfg.id}\`,   \].join('\\n');   // 删除旧容器事件，重新创建重复事件   deleteContainerEvents(cfg.id);   createRecurringEvent(cal, title, desc, cfg); } // Gmail 扫描入口（每 30min Apps Script 定时触发） function scanGmail() {   const threads \= GmailApp.search(     'from:(@school.edu.hk OR @ibo.org) is:unread newer\_than:1d'   );   threads.forEach(t \=\> {     const raw    \= t.getMessages()\[0\].getPlainBody();     const parsed \= callGemini(PARSE\_PROMPT, raw);   // 返回 JSON     if (parsed.deadline) {       createGoogleTask(parsed);   // 写入 Module 2       t.getMessages()\[0\].markRead();     }   }); } |
| :---- |

  **📋  Module 2  Planner 任务与习惯模块**

## **2.1  设计定位：Microsoft Planner 级别**

Module 2 是独立页面，定位为所有待办事项的山顶视图。参考 Microsoft Planner 的分组、看板和表单交互设计，并深度与 IB 学科体系结合。

## **2.2  习惯管理：融入 vs 独立**

| 方案 X：独立习惯模块 🔴 概念重复：习惯本质就是特殊任务 🔴 Google Tasks 无法区分习惯列表 vs 任务列表 🔴 页面切换成本高 🔴 习惯与任务共用调度引擎时需跨模块调用 | 方案 Y：融入 Module 2，独立 Tab（推荐） ✅ 统一调度引擎处理习惯和任务 ✅ Google Tasks 中用独立列表 (IB-Habits) 存储 ✅ UI 上用 Tab 切换，逐展示各自特定属性 ✅ 连续天数、频率等习惯属性通过 Notes-JSON 存储 |
| :---- | :---- |
| **🕎 决策：融入 Module 2，用 Tab 区分「Tasks」和「Habits」** • 习惯小卡片展示频率、连续天数、今日状态，与任务小卡片在视觉上区分。 • 两者共用相同的调度引擎，习惯也可与时间容器绑定。 • Google Tasks 中：IB-Tasks 列表存任务，IB-Habits 列表存习惯，算法层分开读取。 |  |

## **2.3  主要视图设计**

### **2.3.1  看板视图（Board View）——默认**

* 列分组按学科：Math / Chemistry / Biology / English / Language / TOK / EE / CAS / 其他

* 卡片形式显示任务，包含：标题、P1-P4 色标、截止日 Countdown、耗时、状态小圆点

* 卡片拖拽动可更改学科分组；点击卡片展开详情面板

* 应展开列表可切换：全部 / 未完成 / P1 紧迫 / 本周截止

### **2.3.2  列表视图（List View）**

* 按 Slack 升序排列，最紧迫的在最顶

* 支持按学科、优先级、截止日快速过滤

* Slack 进度条在行内可视化（红色=\<24h，橙色=\<72h，绿色=充裕）

### **2.3.3  学年时间线视图（Timeline View）**

* Gantt 式展示 EE/IA 里程碑，展示与单元考核的跨期张力

* 点击事件可展开子任务列表

## **2.4  任务输入表单设计**

| 字段 | 控件类型 | 说明 |
| :---- | :---- | :---- |
| 标题 | 文本输入 | 必填，产出目标描述 |
| 学科 | 下拉选择 | Math / Chem / Bio / Physics / English / Lang / EE / TOK / CAS |
| 优先级 | 单选小按鈕 P1-P4 | 默认 P3；点击即选 |
| 预计耗时 | 数字输入 \+ 单位切换 (min/h) | 调度算法必须字段 |
| 截止日期 | 日期选择器 \+ 时间选择器 | 支持软截止 (尚未确定) |
| 最早开始 | 日期选择器（可空） | 限制调度开始时间（依赖关系用） |
| 前置依赖 | 搜索已有任务 | 选择后，未完成前本任务不可调度 |
| 归属容器 | 下拉选择时间容器 | 额外提示：选择封面利于获得调度时间 |
| 备注 | 多行文本域 | 可选 |

## **2.5  习惯小卡片展示与输入**

| 属性 | 习惯小卡片展示 | 输入表单字段 |
| :---- | :---- | :---- |
| 标题 | 大字显示，如「每日阅读」 | 导动行为描述 |
| 频率 | 图标展示：日/周×N/自定义 | 下拉 \+ 周几写 (1-7) |
| 目标时长 | 如「30分钟」 | 单次目标时长 (min) |
| 绑定容器 | 容器名称标签 | 可选，影响调度窗口 |
| 连续天数 | 🔥 火焰图标 \+ 数字 | 系统自动计算 |
| 今日状态 | 圆圈进度条 \+ 完成/未完成 | 轻点即切换 |

## **2.6  Google Tasks 列表结构**

| Google Tasks 列表名 | 用途 | 内容类型 |
| :---- | :---- | :---- |
| IB-Tasks | 所有核心任务，按截止日排序 | task（Notes 字段封装所有自定义属性） |
| IB-Habits | 所有习惯，按频率管理 | habit（Notes 字段封装 frequency / streak 等） |
| IB-Inbox | Gmail 解析后的检索入站 | 新任务内暂存，待用户确认后转入 IB-Tasks |
| IB-Archive | 已完成且需归档的任务 | 只展示，不调度；定期常调幺幾 |

## **2.7  Module 2 关键工程实现**

| // 创建任务写入 Google Tasks function createIBTask(taskData) {   const meta \= {     v: 1, type: 'task',     subject: taskData.subject,    priority: taskData.priority,     duration\_min: taskData.duration\_min,     container\_id: taskData.container\_id,     depends\_on: taskData.depends\_on,     calendar\_event\_id: null,      healed\_count: 0,   };   Tasks.Tasks.insert({     title:   taskData.title,     due:     taskData.deadline\_iso,     notes:   JSON.stringify(meta),     status:  'needsAction',   }, 'IB-Tasks-ListID'); } // 读取所有任务并解析元数据 function getAllTasks() {   return Tasks.Tasks.list('IB-Tasks-ListID', { showCompleted: false })     .items?.map(t \=\> ({       ...JSON.parse(t.notes || '{}'),       id: t.id, title: t.title,       deadline: new Date(t.due),       slack: calcSlack(new Date(t.due), JSON.parse(t.notes||'{}').duration\_min),     })) ?? \[\]; } |
| :---- |

  **⏱️  Module 3  时间线 Focus 界面**

## **3.1  核心定位**

Module 3 是整个工具的执行层入口，解决“当下该做什么”的问题。它不是一个设置界面，而是学生每天开启工具的默认页面和执行中心。

## **3.2  页面布局：四区域设计**

| 区域 | 位置 | 内容与交互 | 展示逐先级 |
| :---- | :---- | :---- | :---- |
| 主区域：当前任务 | 居中 60% | 任务名称（大字）/ 学科标签 / P1-P4 色块 / 剨余耗时大字倒计时 / 呖中完成按鈕 | 最高 |
| 番茄钟区域 | 右上 20% | 25分钟专注 / 5分钟休息。环形进度条 \+ 値 \+ 开始/暂停按鈕。当前循环次数 | 高 |
| Up Next 区域 | 右下 15% | 接下来 2-3 项任务预论（学科标签 \+ 耗时 \+ Slack 色）/ 紧急插入按鈕 | 中 |
| 导航条（居顶） | 居顶通栏 | 日期 \+ 当前容器名称 \+ 容器剩余时容 / 小日历展开入口 / 设置快捷入口 | 低 |

## **3.3  单日日历覆盖层**

微型日历在导航条右侧展开，覆盖展示当天时间线，和 Module 3 主要页面层叠加。

* 时间轴：尕屏宽度展示小时尺度尺

* 层块可视化：Layer 0 事件（深蓝）→ Layer 1 容器（浅应色）→ Layer 2 任务（优先级色）

* 当前时刻红线指示器，下一容器窗口闪烁提示

* 点击任务块可直接展开完成/疑迟/慨合操作

## **3.4  当下视角：Up Next \+ 紧急插入**

| // 濏航时刻 (18:30)：用户手动拖入 Up Next // 前端 JS: 拖拽插入 function pushToUpNext(taskId) {   google.script.run     .withSuccessHandler(refreshDashboard)     .serverPushUpNext(taskId);     // 调用 Apps Script } // Apps Script 服务端 function serverPushUpNext(taskId) {   const task \= getTask(taskId);   const now  \= new Date();   // 在当前容器窗口或下一尚可用窗口中就近插入   const slot \= getNextAvailableSlot(now, task.duration\_min, \[LAYER0, LAYER1\_HARD\]);   if (slot) {     createCalendarEvent(slot, task, { colorId: '11', override: true });     updateTaskMeta(taskId, { status: 'Scheduled', calendar\_event\_id: slot.eventId });   }   return slot; } |
| :---- |

## **3.5  番茄钟完整设计**

| 状态 | 转换触发 | 前端表现 | 服务端操作 |
| :---- | :---- | :---- | :---- |
| Idle | 进入任务块 / 手动开始 | 占位图标，点击开始 | 无 |
| Focusing | 用户点击开始 | 25min 计时倒数，环形进度条 | 无（纯前端计时） |
| Break | 25min 完成 | 5min 休息计时，提示离屏 | 无 |
| Complete | 用户点击完成按鈕 | 动画打勾，切换 Up Next | PATCH Tasks 状态；更新 Calendar 颜色 |
| Deferred | 用户点击抄语按鈕 | 显示延迟原因选择 | 触发 Heal 逻辑，预计明日时容 |

## **3.6  Chrome Extension 预规划（未来迭代）**

| Chrome Extension 架构规划（Manifest V3） 功能定位：全局小工具栏入口，不替代完整 Web App。 小工具栏播叺展示：当前任务名称 \+ 番茄钟倒计时 \+ Up Next 列表 快捷操作：快Fast 建任务入口 (自动提取当前页面标题) / 完成当前任务 通信方式：通过 Chrome Message Passing 与 Web App iframe 通信 权限要求：identity OAuth2 \+ storage \+ alarms \+ notifications 实现阶段：在 Module 1-3 正式上线并稳定运行后开展。 |
| :---- |

## **3.7  Module 3 核心工程实现**

| // doGet() 返回全屏 Focus Dashboard function doGet(e) {   const page \= e.parameter.page || 'focus';   return HtmlService     .createTemplateFromFile(page)   // focus.html / calendar.html / planner.html     .evaluate()     .setTitle('IB Focus')     .addMetaTag('viewport', 'width=device-width, initial-scale=1')     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); } // 获取当前活跃任务（前端轮询，每 30s） function getActiveTask() {   const now  \= new Date();   const cal  \= CalendarApp.getCalendarById(IB\_CAL\_ID);   const evts \= cal.getEventsForDay(now)     .filter(e \=\> e.getTag('layer') \=== '2'              && e.getStartTime() \<= now              && e.getEndTime()   \>= now);   if (\!evts.length) return null;   const ev  \= evts\[0\];   const meta \= JSON.parse(ev.getTag('task\_meta') || '{}');   return { title: ev.getTitle(), ...meta,     remaining\_min: Math.round((ev.getEndTime()-now)/60000) }; } // 完成当前任务 function completeCurrentTask(taskId, calEventId) {   Tasks.Tasks.patch({ status: 'completed' }, 'IB-Tasks-ListID', taskId);   CalendarApp.getCalendarById(IB\_CAL\_ID)     .getEventById(calEventId)     .setColor(CalendarApp.EventColor.SAGE);   // 变着色=已完成   logToSheets(taskId, 'completed', new Date()); } |
| :---- |

  **第四部分  调度引擎与慨合系统**

## **4.1  调度引擎入口逻辑**

调度引擎是连接 Module 1、2、3 的核心服务，运行方式为 Apps Script 定时任务。

| 触发时机 | 操作 | 输入 | 输出 |
| :---- | :---- | :---- | :---- |
| 每天 06:00 | 全天任务调度 | 容器表 \+ 任务库 | 把当日任务写入 Google Calendar |
| 天内实时 | Defensive Flip | 任务 Slack 计算 | Slack≤24h则事件切Busy，推送提醒 |
| 每晚 23:00 | 每日结算密吉合慨合 | 当天未完成事件列表 | 慨合任务到明天容器 \+ 更新 Sheets |
| 用户手动触发 | Push to Up Next | 用户选择的 task\_id | 就近插入 Calendar \+ Focus Dashboard 刷新 |
| Gmail 扫描 (30min) | 邮件解析建任务 | 老师邮件文本 | 写入 IB-Inbox 列表，推送确认通知 |

## **4.2  Apps Script 实现与 Cloud Run 决策**

| Apps Script (简化版，建议首选) 全部逻辑内置 Google，零配置 定时触发器最高 20个/用户 每次运行限时 6 分钟 适合: 任务数 \< 80，无复杂 CSP 建议 Phase 0-4 均采用此方案 | Cloud Run \+ Python CSP (升级方案) 无 6 分钟限制，处理复杂依赖 运行 Google OR-Tools CSP 求解器 每天一次 Cloud Scheduler 触发 适合: 任务数 \> 80 或有多层依赖 免费额度内成本趋近于零 |
| :---- | :---- |

  **第五部分  开发路线与迭代计划**

| 阶段 | 周期 | 交付目标 | 关键技术产出 | 验证指标 |
| :---- | :---- | :---- | :---- | :---- |
| Phase 0模型验证 | Week 1 | Google Tasks 列表建设 \+ 手动创建 5 个容器 | IB-Tasks / IB-Habits 列表，\[Container\] 日历事件 | 能在 Calendar 上看到容器和任务 |
| Phase 1数据层 | Week 2-3 | Apps Script CRUD 接口全通 | createTask / getTask / updateTask / completeTask | API 呼叫平均 \< 500ms |
| Phase 2调度引擎 | Week 4-5 | 全天调度 \+ Defensive Flip 自动运行 | 06:00 定时任务分配 \+ 23:00 结算慨合 | 每天 \> 90% 任务自动入履容器 |
| Phase 3Module 3 UI | Week 6-7 | Focus Dashboard MVP 上线 | 主区域 \+ 番茄钟 \+ Up Next \+ 导航条 | 完成一个番茄钟循环并完成任务 |
| Phase 4Module 2 UI | Week 8-9 | Planner 看板 \+ 表单上线 | 卷板视图 \+ 水平列表视图 \+ 习惯 Tab | 能建任务并在 Calendar 中看到 |
| Phase 5Module 1 UI | Week 10 | 日历配置页面 \+ Gmail 扫描集成 | \[Container\] 配置 UI \+ Gmail LLM 解析 | 老师邮件自动生成任务 |
| Phase 6坏阳测试 | Week 11-12 | 2 周实际 IB 课程中使用 | 完整三模块联调 | healed\_count 平均 \< 1，完成率 \> 80% |
| Phase 7Chrome 扩展 | Week 13+ | Chrome Extension MVP | 播出 \+ 快捷建任务 \+ 番茄钟 | 小工具栏已可独立使用 |

  **结语：一个工具，三个中心**

Module 1（日历配置）定义时间的结构。Module 2（Planner）定义要做的事。Module 3（Focus）回答“现在该做什么”。三者通过调度引擎串联，共用 Google Tasks 和 Calendar 两层存储。

Google 全生态的选择不是局限，而是策略——所有数据在自己的 Google 账号，零订阅成本，永远可控。

| 🎯 三大模块核心承诺 Module 1 日历与日程 —— 时间的结构性保护，只需开学期初配置一次 Module 2 Planner   —— 所有待办事项的清晰可见性， Microsoft Planner 级别的规岕与交互 Module 3 Focus     —— 每天的执行中心，当下视角——不再问该做什么，只管做就对了 |
| :---- |

文档生成日期：2026年3月  |  v4.0  |  三模块 · Google 全生态 · Chrome 扩展预规划