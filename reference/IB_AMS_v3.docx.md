**IB 学术主权管理体系**

**自研设计版  v3.0**

**五大核心概念 · 时间容器模型 · 三层架构 · 调度算法 · Google 工程实现**

面向 IBDP 学生的时间线中心型学术自研管理工具完整方案

| 本文档结构概览 第一部分：核心概念与体系架构  ·  第二部分：系统逻辑与数据模型  ·  第三部分：自研工程实现  ·  第四部分：开发路线与迭代计划 |
| :---: |

  **第 一 部分  核心概念与体系架构**

本体系的建立基于五个精确定义的核心概念。所有概念均有明确的边界达到，是整个系统设计与工程实现的语义基础。

## **1.1  五大核心概念定义**

| 📅 事件Event | 固定时间、必须参与的确定性日程，属于时间载体层 • 时间与内容均固定，不可随意挤占。无产出要求，仅需到场参与 • 是日程层面的基础单元，必须尊重；是其他概念的“不可侵犯”基线 • 示例：IB 课堂、指导老师会议、考试场次、学校活动 |
| :---: | :---- |

| 📦 时间容器Time Container | 受保护的专属时间段规则，属于时间载体层，用于承载特定类型任务 • 本身无具体行为、无任何产出。是“任务载体”而非“待办事项” • 有明确调度约束和任务类型限定；具有可挪占性和防御等级 • Google Calendar 标记实现：\[Container\] 前缀 \+ 描述字段规则 • 示例：16:00-18:00 上课总结块、18:30 导航时刻、21:30-23:00 结算块 |
| :---: | :---- |

| ✅ 任务Task | 有明确产出、截止时间的可执行待办事项，是核心待办单元 • 有具体交付物（文档、作业、报告）；有明确截止时间，可标记优先级和状态 • 可拆分、可调度至时间容器内执行；支持依赖关系（Precedence Constraint） • 示例：完成 Chemistry IA 数据分析草稿、撰写 EE 第三章、整理单元考错题 |
| :---: | :---- |

| 🔄 习惯Habit | 特殊类型的任务，面向长期重复行为的轻量型待办 • 强调节奏与持续性；无刚性截止时间，无强制单次产出要求 • 归属待办事项层（非时间载体层）；有完成/未完成状态，需主动执行 • 示例：每日阅读 30分钟、每周运动 3 次、CAS 记录更新 |
| :---: | :---- |

| 🔔 提醒事项Reminder | 特定时刻触发的响应提示，无独立时间段占用 • 仅作事件/任务/习惯的触发提醒；无时长、无执行要求 • 示例：任务截止提醒、时间容器开始提醒、习惯执行提醒 |
| :---: | :---- |

## **1.2  关键边界定论（避免混淆）**

| 对比组 | 差异点 | 判断原则 |
| :---- | :---- | :---- |
| 习惯 vs 时间容器 | 习惯是要重复做的具体待办行为；容器是放待办的保护时段 | 需固定时段承载多种不同任务→用容器；需固定时段执行单一重复行为→用习惯 |
| 习惯 vs 事件 | 事件是固定日程，无完成状态，到点即存在；习惯是待办，有完成状态 | 事件不需要“执行”，只需“参与”；习惯需要“主动完成” |
| 容器 vs 任务 | 任务是要做的事，容器是做事的时段；二者是被承载与承载的关系 | 容器不参与任务本身完成，任务需调度至容器内执行 |
| 容器 vs 事件 | 事件是必须参与的固定事项不可替换；容器是可灵活调度任务的保护时段 | 事件内容固定不可变；容器内容由调度决定并可替换 |

## **1.3  三层体系架构**

整个系统分为三个明确边界的层级，层级之间形成“时间载体层”承载“待办事项层”的单向依赖关系。

| 层级 | 层名 | 概念构成 | 职责边界 | 管理原则 |
| :---- | :---- | :---- | :---- | :---- |
| 第一层 | 时间载体层（管时间） | 事件 \+ 时间容器 | 只管什么时候做、有多长时间，不涉及执行行为与完成状态 | 事件锁定不可侵占；容器防御可配置 |
| 第二层 | 待办事项层（管执行） | 任务 \+ 习惯 | 只管要做什么、是否完成，不涉及时间占用 | 任务需调度至容器；习惯可灵活适配 |
| 第三屨 | 辅助提醒层 | 提醒事项 | 仅作触发提示，无独立时间段占用 | 辅助性，用于状态切换和及时响应 |

## **1.4  IB 学生三大时间容器（核心镑点）**

以下三个时间容器是整个 IB 管理体系的镑点将它们候可以将每天的学业节奏结构化，防止混乱。

| 容器名称 | 时段 | 防御等级 | 承载任务类型 | Google Calendar 标记 |
| :---- | :---- | :---- | :---- | :---- |
| 上课总结容器 | 16:00 \- 18:00 每工作日 | Hard（不可覆盖） | 当日 6 科课堂笔记整理、当日作业、短期习惯任务 | \[Container\] 上课学习总结 |
| 晚间导航容器 | 18:30 \- 18:50 每工作日 | Hard（不可覆盖） | 下一时段 Up Next 预览和优先级确认任务 | \[Container\] 晚间导航计划 |
| 今日结算容器 | 21:30 \- 23:00 每工作日 | Soft（默认 Free） | 产出归档（笔记/作业/试卷整理）、触发愈合扫描 | \[Container\] 今日工作结算 |

  **第 二 部分  系统逻辑与数据模型**

## **2.1  完整数据模型**

**Event 模型（事件）**

| Event {   id:           UUID   title:        String   start:        Timestamp   end:          Timestamp   is\_recurring: Boolean   layer:        'LAYER\_0'            // Layer 0 硬约束 } |
| :---- |

**TimeContainer 模型（时间容器）**

| TimeContainer {   id:              UUID   title:           String            // 如 '上课学习总结'   calendar\_prefix: '\[Container\]'     // Google Calendar 标题前缀，固定不变   time\_start:      Time             // 16:00   time\_end:        Time             // 18:00   repeat:          Enum\[Daily|Weekday|Weekend|Custom\]   defense:         Enum\[Hard|Soft\]  // Hard=不可被任何任务覆盖  Soft=可局部弹性   task\_types:      String\[\]         // 承载任务分类白名单   squeezing\_rule:  String           // 拤占规则：'none'|'high\_priority\_only'   layer:           'LAYER\_1' } |
| :---- |

**Task 模型（任务）**

| Task {   id:            UUID   title:         String             // 产出目标描述   subject:       Enum\[Math|Chem|Bio|Physics|English|Lang|EE|TOK|CAS|Other\]   duration:      Int (minutes)      // 预计耗时   deadline:      Timestamp          // 硬截止   start\_date:    Timestamp | null   // 最早开始时间   priority:      Enum\[P1|P2|P3|P4\]   status:        Enum\[Pending|Scheduled|InProgress|Completed|Healed|Overdue\]   depends\_on:    Task.id | null     // 前序依赖   container\_id:  TimeContainer.id  // 归属容器（调度目标）   calendar\_id:   String | null      // 已调度后填入   slack:         Int (minutes)      // 计算属性 \= deadline \- now \- duration   healed\_count:  Int                // 慨合次数   layer:         'LAYER\_2' } |
| :---- |

**Habit 模型（习惯）**

| Habit {                             // 继承自 Task，属于待办事项层   id:            UUID   title:         String   frequency:     Enum\[Daily|Weekly|Custom\]   target\_count:  Int               // 每周目标次数   duration:      Int (minutes)     // 单次目标时长   preferred\_time:Time | null       // 可选，如 20:00（每晚賆词）   container\_id:  TimeContainer.id  // 归属容器（可空）   status\_today:  Enum\[Pending|Done|Skipped\]   streak:        Int               // 连续天数   has\_hard\_deadline: Boolean \= false // 如果有刪性截止则转化为 Task } |
| :---- |

## **2.2  时间容器调度执行逻辑**

调度引擎的核心工作：读取时间容器的承载规则，将匹配的任务按优先级和截止时间填入共居内，同时尊重任务间的依赖关系。

| def assign\_tasks\_to\_containers(containers, tasks, habits, calendar):     for container in containers:         \# 1\. 识别时间容器窗口内的可用时容         free\_slots \= calendar.get\_slots(             window=(container.time\_start, container.time\_end),             exclude=LAYER\_0\_EVENTS         )         \# 2\. 筛选匹配分类的任务         matched \= \[t for t in tasks                    if t.subject in container.task\_types                    and t.status \== PENDING                    and not is\_blocked\_by\_dependency(t)\]         \# 3\. 按紧迫度排序（Slack 最小的优先）         matched.sort(key=lambda t: t.slack)         \# 4\. 依次分配到可用时容，尊重依赖顺序         for task in matched:             slot \= find\_slot(free\_slots, task.duration, task.depends\_on)             if slot:                 calendar.create\_event(slot, task, container\_id=container.id)                 task.status \= SCHEDULED                 free\_slots.consume(slot)         \# 5\. 填充习惯任务（在任务之后）         for habit in habits:             if habit.container\_id \== container.id and habit.status\_today \== PENDING:                 slot \= find\_slot(free\_slots, habit.duration)                 if slot:                     calendar.create\_event(slot, habit)                     habit.status\_today \= SCHEDULED |
| :---- |

## **2.3  防御翻转与动态 Slack 计算**

| def run\_defensive\_checks(tasks, calendar, now):     for task in tasks:         task.slack \= (task.deadline \- now) \- task.duration         if task.slack \<= 24 \* 60:           \# 24h 阈値             \# 将 Calendar 事件状态 Free → Busy（锁定）             calendar.set\_event\_busy(task.calendar\_id)             task.priority \= P1             notify(task, level='URGENT')         if task.slack \<= 0:                 \# 已达逾期临界             notify(task, level='OVERDUE')             trigger\_heal(task, calendar) |
| :---- |

## **2.4  动态愈合完整流程**

| def daily\_settlement(calendar, task\_db, habit\_db, now):     """每天 23:00 运行。扫描未完成项并慨合。"""     today\_events \= calendar.get\_task\_events(date=today())     summary \= {'completed': 0, 'healed': 0, 'urgent': 0, 'habits\_done': 0}     for ev in today\_events:         task \= task\_db.get(ev.task\_id)         if task.status \!= COMPLETED:             remaining \= task.duration \- ev.completed\_minutes             \# 评估慨合后风险             post\_heal\_slack \= (task.deadline \- tomorrow()) \- remaining             if post\_heal\_slack \<= 0:                 task.priority \= P1                 summary\['urgent'\] \+= 1             \# 滑移到明天最近可用容器窗口             task.duration \= remaining             healed \= assign\_tasks\_to\_containers(                 \[get\_container(task.container\_id)\], \[task\], \[\], calendar,                 force\_date=tomorrow()             )             if healed: task.healed\_count \+= 1             summary\['healed'\] \+= 1         else:             summary\['completed'\] \+= 1     \# 统计习惯完成情况     for habit in habit\_db.get\_today():         if habit.status\_today \== DONE: summary\['habits\_done'\] \+= 1     push\_summary(summary)       \# 推送结算摘要到 Slack/通知 |
| :---- |

## **2.5  IB 全学年任务体系与时间容器映射**

| 任务类型 | 所属容器 | 全学年入口时间 | 优先级范围 | 耐久属性 |
| :---- | :---- | :---- | :---- | :---- |
| IB 课堂（事件） | Layer 0 硬约束 | 全学年 | N/A (不可移动) | 固定 |
| IA 所有阶段 | 上课总结 \+ 结算容器 | DP1-DP2 | P3→P1 辭进 | 12-15周循环 |
| EE 撰写 | 结算容器 (主) \+ 上课总结 (辅) | DP1-DP2 | P3→P1 辭进 | 12个月持续 |
| TOK 展览 \+ 论文 | 结算容器 | DP1下学期-DP2上学期 | P2 | 阶段性 |
| CAS 记录 | 上课总结容器 | 全学年 | P3 | 持续18个月 |
| 单元考核复习 | 结算容器 (主) | 考前 7 天密集输入 | P2→P1 | 重复和集 |
| 每日笔记整理（习惯） | 上课总结容器 | 每天 | P3 (习惯) | 日常和集 |
| 模拟考备考 | 结算容器 | 学年末 | P1 | 高密度和集 |

  **第 三 部分  自研工程实现**

## **3.1  Google Calendar 时间容器标记调度层**

**3.1.1  时间容器标记范全**

所有时间容器均通过 Google Calendar 原生事件实现，增加统一前缀和描述字段以支持系统自动识别。

| \# 时间容器标层规范 \# 标题格式：\[Container\] {name} ({time\_start}-{time\_end}) \# 示例：\[Container\] 上课学习总结 (16:00-18:00) \# 描述字段标准化内容： 类型: 时间容器 分类: IB学习 时间窗口: 16:00-18:00 防御等级: Hard 承载任务类型: 所有IB学科,笔记整理,习惯任务 可挤占性: 否 |
| :---- |

**3.1.2  Google Calendar 事件 Schema**

| \# 任务事件写入 Calendar 的标准格式 event \= {     'summary':  task.title,     'start':    { 'dateTime': slot.start\_iso },     'end':      { 'dateTime': slot.end\_iso },     'colorId':  PRIORITY\_COLOR\[task.priority\],  \# P1=11(Red) P2=6(Orange) P3=5(Banana) P4=2(Sage)     'extendedProperties': { 'private': {         'task\_id':      task.id,         'layer':        '2',                    \# LAYER\_2 填充层标记         'subject':      task.subject,         'priority':     task.priority,         'container\_id': task.container\_id,      \# 归属容器         'status':       task.status,     }} } |
| :---- |

## **3.2  Google Sheets 数据库设计**

Google Sheets 作为所有待办事项的可视化编辑层，每个工作表对应一个实体类型。

| Sheet 表 | 关键列 | 主要用途 |
| :---- | :---- | :---- |
| tasks | task\_id, title, subject, duration\_min, deadline, priority, status, depends\_on, container\_id, calendar\_event\_id, healed\_count, notes | 所有任务的主设库 |
| habits | habit\_id, title, frequency, duration\_min, preferred\_time, container\_id, streak, status\_today | 所有习惯的主设库 |
| containers | container\_id, name, time\_start, time\_end, defense, task\_types, squeezing\_rule | 时间容器配置表 |
| daily\_log | date, task\_id, scheduled\_start, actual\_start, completed\_min, status | 每日执行日志，用于慨合计算 |
| heal\_log | date, task\_id, original\_slot, healed\_to, reason | 慨合历史记录，监控拖延健康度 |

## **3.3  Gmail 邮件解析模块**

| 触发条件 发件人来自学校或导师邮符1 邮件中包含截止日期关键词 Apps Script 定时扫描，每 30 分钟检查未读邮件 | LLM 解析输出 (JSON) task\_title: 产出目标描述 deadline: YYYY-MM-DDTHH:MM:00 estimated\_duration\_minutes: 数字 subject: 学科名称 priority: P1/P2/P3/P4 container\_hint: 建g建归属容器 depends\_on\_description: 前序依赖或null |
| :---- | :---- |

| \# Apps Script 模块入口 function scanTeacherEmails() {   const threads \= GmailApp.search(     'from:(@school.edu) is:unread newer\_than:1d'   );   threads.forEach(thread \=\> {     const msg  \= thread.getMessages()\[0\];     const body \= msg.getPlainBody();     const parsed \= callGemini(PARSE\_TASK\_PROMPT, body);     if (parsed && parsed.deadline) {       writeToSheets('tasks', parsed);          // 写入 Sheets       scheduleTask(parsed);                    // 即刻调度入容器       msg.markRead();     }   }); } |
| :---- |

## **3.4  Focus Dashboard 设计**

**3.4.1  三区域布局**

| 区域 | 内容 | 布局占比 | 交互 |
| :---- | :---- | :---- | :---- |
| 主区域 | 当前任务名称 \+ 剩余时长 \+ 当前容器名称 | 65% | 完成按鈕→更新 Calendar \+ Sheets |
| 番茄钟区 | 25分钟专注 / 5分钟休息循环，进度条可视化 | 20% | 开始/暂停/重置 |
| Up Next 区 | 接下来 2 项任务预论 \+ 今日容器剩余时容 | 15% | 紧急插入按鈕 |

**3.4.2  Apps Script 实现框架**

| // doGet(e) 返回全屏 HTML Dashboard function doGet(e) {   return HtmlService     .createHtmlOutputFromFile('dashboard')       // dashboard.html     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)     .setTitle('IB Focus Dashboard'); } // getActiveTask() 前端 JS 调用，获取当前任务 function getActiveTask() {   const now \= new Date();   const cal \= CalendarApp.getCalendarById(IB\_CALENDAR\_ID);   const events \= cal.getEventsForDay(now).filter(e \=\>     e.getTag('layer') \=== '2'     &&  // 只取 Layer 2 填充层     e.getStartTime() \<= now       &&     e.getEndTime()   \>= now   );   return events\[0\] ? eventToTask(events\[0\]) : null; } // completeTask() 前端点击完成按鈕时调用 function completeTask(taskId) {   updateSheetStatus(taskId, 'Completed');   CalendarApp.getEventById(     getCalendarEventId(taskId)   ).setColor(CalendarApp.EventColor.SAGE);       // 变着色表示完成 } |
| :---- |

## **3.5  每日结算脚本与 Slack 推送**

**脚本入口与推送格式**

| // Apps Script 时间触发器：每日 23:00 function dailySettlementTrigger() {   const summary \= runDailySettlement();          // 调用慨合逻辑   const message \= formatSummary(summary);        // 格式化推送内容   postToSlack(message);                          // Incoming Webhook } // 每日推送内容模板 // 📊 今日 IB 学业结算 // ✅ 完成 {completed} 项任务，🔄 慨合 {healed} 项 // 🚨 紧迫 {urgent} 项任务将在 24h 内截止 // 🔥 {habits\_done}/{habits\_total} 个习惯已完成 // → 请只确认今日 Focus Dashboard 状态 |
| :---- |

  **第 四 部分  开发路线与工具选型**

## **4.1  分阶迭代路线**

| 阶段 | 周期 | 交付目标 | 关键产出 |
| :---- | :---- | :---- | :---- |
| Phase 0概念验证 | 第1周 | Sheets 建表 \+ 手动容器标记 \+ 手动调度 | 验证五大概念边界在实际使用中是否清晰 |
| Phase 1数据层 | 第2-3周 | Sheets 完整 Schema \+ Apps Script CRUD 接口 | 全量数据可通过 API 读写 |
| Phase 2调度引擎 | 第4-5周 | 容器识别 \+ 任务分配 \+ Defensive Flip | schedule\_task() \+ assign\_to\_container() 完整可运行 |
| Phase 3Focus UI | 第6-7周 | Focus Dashboard Web App 上线 | 实现当下视角，番茄钟+Up Next 可用 |
| Phase 4结算与慨合 | 第8周 | 每日 23:00 慨合 \+ Slack 推送 | daily\_settlement() 自动运行，魔法闭环 |
| Phase 5邮件解析 | 第9-10周 | Gmail LLM 集成 \+ 自动建任务 | 老师邮件自动变任务，进入容器 |
| Phase 6持续迭代 | 持续 | 根据使用反馈优化算法 | 辭进靠近理想工具 |

## **4.2  Reclaim.ai 核心概念借鉴清单**

以下概念在 Reclaim.ai 中已被证实可行，自研时可直接借鉴其设计逻辑，而并非必须从头推导。

| Reclaim.ai 概念 | 自研对应实现 | 自研改进点 |
| :---- | :---- | :---- |
| AI Habits (Habits 功能) | Habit 模型继承自 Task，归属待办层 | 可针对 IB 学科定制习惯频率和目标时长 |
| Time Defense (Free/Busy) | defensive\_flip() 监控 Slack 并翻转事件状态 | Slack 阈値可针对任务类型分别设置 |
| Heal (Auto-reschedule) | daily\_settlement() 中的 trigger\_heal()，就近分配容器内 | 容器内慨合：任务优先北调至同类型容器 |
| Up Next Queue | push\_to\_up\_next() 则即就近将任务插入容器窗口 | 深度集成番茄钟，而不仅仅是排号 |
| Split up (Chunking) | 任务创建时可配置 chunk\_size，自动拆分子任务 | 可为 EE 、IA 设置不同的块大小 |
| Smart Meeting Link | Google 表单 \+ Apps Script，生成预约连接 | 可附带所希望容器时容自动信息 |
| Auto-lock | 截止前 N 天将任务的 Calendar 事件设为 Busy | N 值可根据学科和任务类型分别配置 |

## **4.3  工具选型与监控指标**

| 延伸工具选型 Google OR-Tools: 复杂 CSP 调度求解 Google Gemini API: 邮件解析，免费额度通常足够 Slack Incoming Webhook: 推送提醒 clasp: Apps Script 与 GitHub 同步 Vue 3 CDN: 轻量化 Dashboard 前端 PWA manifest.json: 封装为手机应用 | 健康度监控指标 healed\_count: 任务慨合次数，超过3则拖延高风险 habits\_streak: 连续天数下降则节奏失调 container\_utilization: 容器占用率，识别任务过多/过少 daily\_completion\_rate: 每日完成率，长期居下则调整任务量 slack\_heatmap: 任务紧迫度热力图 |
| :---- | :---- |

  **结语：概念清晰是工程质量的前提**

本文档的核心价值在于“五大概念精确定义”：事件、时间容器、任务、习惯、提醒事项各司其职。最容易引发工程陷阱的正是概念边界的模糊——当你设计数据模型和调度逻辑时，必须知道怎么区分它们。

时间容器概念是本版最大的新增：它将“防御层”从一个模糊的层级概念提升为一个可建模、可配置、可工程化的核心实体。每个属性（防御等级、承载类型、可挤占性）都直接影响调度算法的行为，而非只是日历上的一块颜色。

| 🎯 三个核心承诺 1\. 学术卓越：所有 IA、EE 等长周期项目按里程碑交付，不遗漏任何节点 2\. 管理自动化：时间分配由算法决策，学生只需专注产出结果 3\. 心理稳态：任意时刻只需看一眼时间线，就知当前唯一最高优先级任务 |
| :---- |

文档生成日期：2026年3月  |  自研版 v3.0  |  基于五大核心概念重构