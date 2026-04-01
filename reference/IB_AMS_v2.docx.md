**IB 学术主权管理体系**

**自研设计版**

**需求分析 · 逻辑设计 · 系统工程 · 工具实现 · 开发路线**

面向 IBDP 学生的时间线中心型学术自研管理工具完整方案

| 本文档结构概览 第一部分：需求分析与规划  ·  第二部分：系统逻辑设计  ·  第三部分：自研工程实现  ·  第四部分：开发路线与工具选型 |
| :---: |

| 💡 设计哲学 本文档以自研工具为主路。Reclaim.ai 作为概念参考被引用，不作为主要依赖。 自研的核心价值：完全控制调度算法、零订阅成本、适配 IB 多学科细颗粒度场景、可持续迭代扩展。 |
| :---- |

  **第 一 部分  需求分析与规划**

## **1.1  核心问题：我想解决什么？**

IB 课程体系（IBDP）横跨六门学科加核心课程，是世界上认知负荷最高的高中体系之一。不同于普通学生使用第三方工具拼凑解决方案，我们选择自研一套梵合最低、最适配自身学业特征的工具，因为这本质上是一个工程问题。

| 问题维度 | 具体表现 | 根本原因 | 自研优势 |
| :---- | :---- | :---- | :---- |
| 认知负荷过载 | IA×6、EE×1、TOK+CAS任务量极大、碎片化严重 | 缺乏统一任务可见性与优先级排序 | 自定义学科标签和多维分类逻辑 |
| 管理与执行脱节 | 大量时间用于思考该做什么，真正产出时间严重压缩 | 计划工具与执行工具分离 | 自研将计划与执行内嵌于同一界面 |
| 防御性不足 | 突发作业、社团通知等轻易摘毁日程 | 日程为静态结构，缺乏自我修复能力 | 自研动态愈合完全自主控制 |
| 当下聚焦困难 | 多任务并发时无法进入深度工作状态 | 没有此刻唯一任务的清晰显示 | 自研 Focus Dashboard 加加番茄钟集成 |

## **1.2  设计哲学：为什么选择自研？**

| Reclaim.ai 等第三方工具的限制 订阅费用持续支出，学生期间投入不合算 算法黑筱，无法优化 IB 多学科依赖关系 数据存在外部服务，隐私控制弱 功能固定，无法根据个人学业节奏定制 第三方集成有限，无法深度嵌入 IB 考试周期 | 自研工具的核心价值 零订阅成本，基于 Google 生态完全免费运行 完全控制调度算法，针对 IB 超细颗粒度定制 数据存储在自己的 Google 账号，隐私上限 可与学校系统深度嵌入，自定义任何自动化逻辑 建立属于自己的工具，是一种可迁移技能 |
| :---- | :---- |

## **1.3  达成目标**

**🎯 目标一：学术卓越**

* 确保所有 IA、EE 等长周期项目严格按里程碑交付，不遗漏任何单元考核复习节点

* EE（12个月）、IA×6（跨学期）、TOK 论文与展览均纳入可追踪的阶段性任务系统

* 单元考核（每学期三次×六科）与学年模拟考前均有充分复习缓冲

**⚙️ 目标二：管理自动化**

* 将时间分配的决策成本外包给算法，学生只负责定义规则和产出结果

* 需求、设计、开发、迭代——自研过程本身就是对管理能力的投资

* 逐步迭代，从 MVP 到全功能，永远可扩展

**🧠 目标三：心理稳态**

* 在任意时刻，只需看一眼时间线，就能知道当前唯一的最高优先级任务

* 4点至6点总结块、6:30导航时刻、9:30-11点结算时段必须被系统保护且不可剪切

## **1.4  功能清单与自研范围**

| 功能模块 | 具体需求 | 自研 or 外包 | 优先级 |
| :---- | :---- | :---- | :---- |
| 日历同步层 | Google Calendar 作为数据库单一事实来源 | 外包 Google API | P1 |
| 任务调度引擎 | CSP 优化算法，动态填充空隙、防御翻转、慨合 | 自研核心 | P1 |
| 展示层 | Focus Dashboard （当下情境）、居次居内视图 | 自研 | P1 |
| 任务录入界面 | 快速新建任务，设定 P/Duration/Deadline/Subject | 自研 | P1 |
| 每日结算脚本 | 每晚 23:00 扫描未完成项，触发慨合并推送摘要 | 自研 | P1 |
| 邮件解析模块 | LLM 解析老师邮件，自动生成任务 | 自研（调用 LLM API） | P2 |
| 状态同步 | 进入专注块时自动推送 Slack DND | 外包 Slack API | P2 |
| 多设备支持 | PWA 封装，内容可在时源和手机上访问 | 自研 | P3 |

  **第 二 部分  系统逻辑设计**

本部分定义系统的核心概念、数据流、调度逻辑与关键算法。所有设计均以 Google Calendar 为单一事实来源，在其之上构建智能调度层。

## **2.1  四层时间线架构**

| 层级 | 名称 | 定义 | 对应数据结构 | 优先级秩序 |
| :---- | :---- | :---- | :---- | :---- |
| Layer 0 | 静态层 | 不可移动的硬约束：上课、既定会议 | Google Calendar 全天候 Busy 事件 | 最高，算法不得侵占 |
| Layer 1 | 防御层 | 框架性日程：4-6点总结、6:30导航。9:30结算 | ScheduleBlock 对象，带 soft/hard 防御标记 | 次高，极端情况下可弹性让步 |
| Layer 2 | 填充层 | 任务块：IA撰写、EE章节、复习块 | Task 对象，带 P1-P4 和 Slack 属性 | 算法动态排序，填入空隙 |
| Layer 3 | 触发层 | 特定时刻触发的提醒，不占用时间块 | Reminder 对象，推送渠道可配置 | 辅助性，用于状态切换 |

## **2.2  核心数据模型**

**Task 对象（填充层核心）**

| Task {   id:          UUID                    // 唯一标识   title:       String                  // 产出目标描述   subject:     Enum\[Math|Chem|Bio|EE|TOK|CAS|...\]   duration:    Int (minutes)           // 预计耗时   deadline:    Timestamp               // 硬截止日期   start\_date:  Timestamp | null        // 最早开始时间   priority:    Enum\[P1|P2|P3|P4\]   status:      Enum\[Pending|Scheduled|InProgress|Completed|Healed|Overdue\]   depends\_on:  Task.id | null          // 前序依赖   calendar\_id: String | null           // 对应 Calendar 事件 ID   healed\_count:Int                     // 慨合次数（健康度监控）   slack:       Int (minutes)           // 计算属性 \= deadline \- now \- duration } |
| :---- |

**ScheduleBlock 对象（防御层）**

| ScheduleBlock {   id:          UUID   name:        String                  // 上课总结 / 导航时刻 / 结算块   time\_start:  Time                    // 16:00 / 18:30 / 21:30   time\_end:    Time                    // 18:00 / 18:50 / 23:00   repeat:      Enum\[Daily|Weekday|Weekend|Custom\]   defense:     Enum\[Hard|Soft\]         // Hard \= 不可覆盖, Soft \= 极端情况可让步   action\_type: Enum\[Summary|Navigate|Settle|Focus\] } |
| :---- |

## **2.3  调度引擎算法设计**

**目标函数**

| 最小化最大逾期量 (Minimizing Maximum Lateness) Minimize: max(Lateness\_i)  其中  Lateness\_i \= max(0, Finish\_i − Deadline\_i) 约束条件：   *C1. Start\_Time(Task\_i) ≥ Current\_Time                「不安排过去」*   *C2. End\_Time(Task\_i) ≤ Deadline\_i                    「尽量在截止前完成」*   *C3. 任务块不重叠 (Disjunctive Constraint)*   *C4. 避开 Layer 0 和 Layer 1 Hard 块*   *C5. depends\_on 完成后，后继任务才可安排 (Precedence)* |
| :---- |

**Slack 计算与防御翻转逻辑**

| def calculate\_slack(task, now):     return (task.deadline \- now) \- task.duration def defensive\_flip(task, now, calendar):     slack \= calculate\_slack(task, now)     if slack \<= 24 \* 60:                         \# 24小时内         calendar.set\_busy(task.calendar\_id)      \# Free → Busy         task.priority \= max(task.priority, P1)   \# 升级优先级         notify(task, 'URGENT')                   \# 推送警报     elif slack \<= 0:                             \# 已逾期         notify(task, 'OVERDUE')         return trigger\_heal(task) |
| :---- |

**核心调度函数**

| def schedule\_task(task, calendar, horizon=7\*24\*60):     \# 获取未来 7 天可用窗口     windows \= calendar.get\_free\_windows(         start=now(),         end=now()+horizon,         exclude=\[LAYER\_0, LAYER\_1\_HARD\],         min\_duration=task.duration     )     \# 尊重依赖关系：前序任务未完成则不开始     if task.depends\_on and not is\_completed(task.depends\_on):         earliest \= get\_completion\_time(task.depends\_on)         windows \= \[w for w in windows if w.start \>= earliest\]     \# 按 Urgency (最小 Slack 优先) 排序     windows.sort(key=lambda w: calculate\_slack(task, w.start))     for window in windows:         if window.duration \>= task.duration:             slot \= Slot(window.start, window.start \+ task.duration)             calendar.create\_event(slot, task)    \# 写入 Google Calendar             task.status \= SCHEDULED             task.calendar\_id \= slot.event\_id             return slot     notify(task, 'NO\_SLOT\_FOUND')               \# 无法安排，触发警报     return None |
| :---- |

## **2.4  动态愈合（Healing）完整逻辑**

| def daily\_settlement(calendar, task\_db, now):     today\_blocks \= calendar.get\_task\_events(date=today())     summary \= { 'completed': 0, 'healed': 0, 'urgent': 0 }     for block in today\_blocks:         task \= task\_db.get(block.task\_id)         if task.status \!= COMPLETED:             \# 计算剩余耗时             remaining \= task.duration \- block.completed\_minutes             \# 评估慨合后风险             slack\_after\_heal \= calculate\_slack(                 Task(duration=remaining, deadline=task.deadline), tomorrow()             )             if slack\_after\_heal \<= 0:                 task.priority \= P1                 notify(task, 'HEAL\_URGENT')                 summary\['urgent'\] \+= 1             \# 滑移安排             task.duration \= remaining             healed\_slot \= schedule\_task(task, calendar, start\_from=tomorrow())             if healed\_slot:                 task.status \= HEALED                 task.healed\_count \+= 1                 summary\['healed'\] \+= 1         else:             summary\['completed'\] \+= 1     push\_daily\_summary(summary)   \# 每晚推送结算摘要 |
| :---- |

## **2.5  当下视角实现逻辑**

当下视角是本体系最核心的用户体验目标：学生在任意时刻应能毫不稻豪地知道现在该做什么。实现机制分三步：

1. 18:30 导航时刻：用户将当晚最高价值任务（不超过三项）内嵌到 Up Next 队列。系统无视其他所有优先级排序，在当前时刻后将这些任务即刻插入最近空档。

2. 进入专注块：系统全屏切换到 Focus Dashboard，显示当前任务名称 \+ 番茄钟倒计时 \+ 剩余时长，同时推送 Slack DND 状态，切断碎片化干扰。

3. 紧急覆盖：若出现突发高优先级任务，任意时刻都可调用 push\_to\_up\_next(task\_id) 接口，将其推至即时执行队列首位。

| def push\_to\_up\_next(task\_id, calendar, now):     task \= task\_db.get(task\_id)     \# 对当前时间进行局部重调，不重整全局     next\_window \= calendar.get\_next\_free\_window(         after=now(), min\_duration=task.duration,         exclude=\[LAYER\_0, LAYER\_1\_HARD\]     )     if next\_window:         calendar.insert\_event(next\_window, task, priority\_override=True)         focus\_dashboard.set\_active(task) |
| :---- |

## **2.6  IB 全学年任务拓扑**

| 任务大类 | 子类型 | 典型任务 | 默认优先级 | 标准耗时 | 周期 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| 六科日常 | 日常作业 | Math HL 习题集 | P3 | 30-60分钟 | 每日 |
| 六科日常 | 单元考核复习 | Chemistry Ch5 复习 | P2→P1 | 90分钟/天 | 考前7天 |
| 六科日常 | 模拟考备考 | 全科综合复习 | P1 | 3-4h/天 | 学年末 |
| 内部评估 IA | 选题研究 | 选题调研（2周） | P3 | 1h/次 | 第1-2月 |
| 内部评估 IA | 实验收集 | 实验操作 | P2 | 2h/次 | 第3-6月 |
| 内部评估 IA | 撰写修订 | IA 草稿撰写 | P1→P2 | 90分钟/次 | 第7-10月 |
| 扩展论文 EE | 选题 | 研究问题精炼 | P2 | 3h | 第1月 |
| 扩展论文 EE | 文献研究 | 文献整理周周繼续 | P3 | 2h/周 | 第2-4月 |
| 扩展论文 EE | 撰写修订 | EE 分段章节 | P2→P1 | 2h/次 | 第5-10月 |
| TOK | 展览 \+ 论文 | Exhibition \+ Essay | P2 | 1.5h/次 | DP1-DP2 |
| CAS | 创意+活动+服务 | 乘器/运动/义工 | P3 | 45-90分钟 | 持续18月 |
| 整理输出 | 笔记/作业/试卷 | 日常归档整理 | P3→P2 | 20-30分钟 | 每日结算块 |

  **第 三 部分  自研工程实现（Google 生态）**

本部分描述完整的工程实现方案。技术栈完全基于 Google 生态，运行成本趋近于零。

## **3.1  整体系统架构**

| 层级 | 技术组件 | 职责 | 实现方式 |
| :---- | :---- | :---- | :---- |
| 数据层 | Google Calendar API v3 | 单一事实来源，存储所有块 | OAuth2 认证，请求 /events CRUD |
| 数据层 | Google Sheets API | 任务数据库 \+ 可视化编辑 \+ 历史记录 | Apps Script 或 Python gspread |
| 解析层 | Google Apps Script \+ LLM API | 邮件解析、运行时触发器 | Gmail watch() \+ Gemini/DeepSeek API |
| 调度引擎 | Python (Google Colab / Cloud Run) | CSP 算法执行层，每晚 23:00 定时运行 | Cloud Scheduler \+ Cloud Run (or Apps Script trigger) |
| 显示层 | Google Apps Script Web App | Focus Dashboard 全屏界面 | doGet() 返回 HTML+JS，部署为 Web App URL |
| 推送层 | Slack API / Google Chat API | 推送提醒、DND、结算摘要 | Incoming Webhook / Bot Token |

## **3.2  模块一：Google Calendar 同步层**

**3.2.1  连接配置**

* 创建 Google Cloud 项目，开启 Calendar API

* 配置 OAuth2 应用，获取 credentials.json

* 创建专用日历（IB Tasks）与主日历分离，避免数据混杂

**3.2.2  事件归一化 Schema**

| \# 每个 Task 应射到 Calendar 的一个 Extended Properties event \= {   'summary': task.title,   'start': { 'dateTime': slot.start\_iso },   'end':   { 'dateTime': slot.end\_iso },   'colorId': PRIORITY\_COLOR\_MAP\[task.priority\],   \# P1=11(Red) P2=6(Orange)   'extendedProperties': {     'private': {       'task\_id':   task.id,       'subject':   task.subject,       'priority':  task.priority,       'status':    task.status,       'is\_layer':  '2',                           \# Layer 标记     }   } } |
| :---- |

## **3.3  模块二：Google Sheets 任务数据库**

**Sheet 结构设计**

| 列名 | 类型 | 说明 | 写入方式 |
| :---- | :---- | :---- | :---- |
| task\_id | STRING | 唯一 UUID，与 Calendar 事件 extendedProperties 关联 | 自动生成 |
| title | STRING | 产出目标描述 | 用户填写 / LLM 自动提取 |
| subject | ENUM | Math/Chem/Bio/Physics/English/Lang/EE/TOK/CAS | 用户选择 |
| duration\_min | INT | 预计耗时（分钟） | 用户填写 |
| deadline | DATETIME | ISO 8601 格式 | 用户填写 / LLM 提取 |
| start\_date | DATETIME | 最早开始时间（可空） | 用户填写 |
| priority | ENUM | P1/P2/P3/P4 | 用户设定 / 算法调整 |
| depends\_on | STRING | 前序 task\_id（可空） | 用户填写 |
| status | ENUM | Pending/Scheduled/InProgress/Completed/Healed/Overdue | 系统自动更新 |
| calendar\_event\_id | STRING | 已调度后由系统填入 | 系统自动 |
| healed\_count | INT | 慨合次数，拖延健康度指标 | 系统计数 |
| notes | STRING | 额外备注 / 邮件来源摘要 | 用户或 LLM |

## **3.4  模块三：Gmail 邮件监听器（LLM 解析）**

**3.4.1  监听机制**

| // Google Apps Script function setupGmailWatch() {   GmailApp.search('from:teacher\_domain.edu is:unread').forEach(thread \=\> {     const msg \= thread.getMessages()\[0\];     const body \= msg.getPlainBody();     const parsed \= callLLM(PARSE\_TASK\_PROMPT, body);     if (parsed.deadline) createTask(parsed);   }); } // 由 Apps Script 时间触发器每 30 分钟运行一次 |
| :---- |

**3.4.2  LLM Prompt 模板**

| Gmail 解析 Prompt 你是一个 IB 学生的学术助理。请从以下邮件中提取任务信息。 输出严格的 JSON 格式，不要任何额外文字或 Markdown： {   *"task\_title": "简洁的产出目标描述",*   *"deadline": "YYYY-MM-DDTHH:MM:00",*   *"estimated\_duration\_minutes": 数字,*   *"subject": "学科名称",*   *"priority": "P1或P2或P3或P4",*   *"depends\_on\_description": "前序依赖描述或null",*   *"notes": "其他重要信息"* } 若无法确定截止日期，设 deadline 为 null。 |
| :---- |

## **3.5  模块四：Focus Dashboard 设计**

**3.5.1  界面层次**

* 层级一：全屏主功能区（占 70%）——当前任务名称 \+ 剩余时长大字显示

* 层级二：番茄钟区（占 20%）—— 25分钟专注 \+ 5分钟休息，进度条可视化

* 层级三：Up Next 预论区（占 10%）——显示下两个任务，提前预知过渡

**3.5.2  关键交互**

* 将任务内嵌到时序：完成按鈕 → PATCH Calendar 事件状态 \+ 更新 Sheets

* 番茄钟强制分段：25/5 min 循环，最后5分钟自动退出全屏模式提醒切换

* 紧急插入按鈕：调用 push\_to\_up\_next() 即可将任何任务挂载到当前时创

**3.5.3  Apps Script 实现框架**

| // doGet() \- 返回全屏 HTML function doGet() {   return HtmlService.createHtmlOutputFromFile('dashboard')     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); } // getActiveTask() \- 前端调用获取当前任务 function getActiveTask() {   const now \= new Date();   const events \= CalendarApp.getCalendarById(IB\_CALENDAR\_ID)     .getEventsForDay(now)     .filter(e \=\> e.getTag('is\_layer') \=== '2'    // 只取 Layer 2 任务               && e.getStartTime() \<= now               && e.getEndTime() \>= now);   return events.length \> 0 ? eventToTask(events\[0\]) : null; } |
| :---- |

## **3.6  模块五：每日结算脚本**

**触发方式**

* Apps Script 时间驱动器：每日 23:00 自动触发 dailySettlement()

* 也可在用户手动将结算块标记为完成时提前触发

**输出**

* 推送 Slack/手机通知：今日完成 X 项，慨合 Y 项，紧迫 Z 项

* 更新 Sheets 每行状态屗段 (Healed / Overdue)

* 写入 Google Calendar 新的慨合块

## **3.7  模块六：调度引擎运行环境**

| 方案 A：Apps Script 简化版 无需额外服务器，全在 Google 内部运行 时间触发器每晚 23:00 运行结算 局限： Apps Script 运行时间 6分钟/次 适合：Slack \<= 30 项任务的常规调度 建议 MVP 阶段优先使用此方案 | 方案 B：Python \+ Cloud Run 全功能版 Google Cloud Run 或 Colab 定时任务 运行 Python CSP 优化器（scipy.optimize） 无 6 分钟限制，可处理复杂多层依赖 适合：任务数 \> 50、依赖关系复杂场景 成本：Cloud Run 免费额度通常足够 |
| :---- | :---- |

  **第 四 部分  开发路线与工具选型**

## **4.1  MVP 分阶开发路线**

建议采用迭代开发策略，每个阶段都能独立运行和产生价值，而不是等到全部完成后才能使用。

| 阶段 | 周期 | 交付目标 | 核心工作 | 预期效果 |
| :---- | :---- | :---- | :---- | :---- |
| Phase 0MVP | 第1-2周 | Google Sheets 手动创建 \+ 日历同步贡美 | 搭建 Sheets 数据库结构；手动将任务写入 Calendar；验证数据模型 | 能见到所有任务在日历上的概览 |
| Phase 1自动调度 | 第3-4周 | Apps Script 调度引擎上线 | 实现 schedule\_task() \+ defensive\_flip()；每晚 23:00 运行结算 | 任务完全自动安排，应慨合自动滑移 |
| Phase 2Focus UI | 第5-6周 | Focus Dashboard 上线 | 建立 Apps Script Web App；实现番茄钟 \+ 当前任务幅面 | 实现当下视角，进入专注快速切换 |
| Phase 3邮件解析 | 第7-8周 | Gmail LLM 集成上线 | 配置 Apps Script 定时扫描；接入 LLM API；测试解析准确度 | 老师邮件自动转化任务 |
| Phase 4状态同步 | 第9-10周 | Slack 集成 \+ 推送 | 配置 Slack Webhook；实现 DND 自动切换；推送结算摘要 | 全面状态同步，完成闭环 |
| Phase 5优化迭代 | 持续 | 性能优化 \+ 功能拖展 | 根据实际使用反馈调整算法；添加 IB 年度视图 | 不断靠近理想工具 |

## **4.2  Reclaim.ai 概念借鉴清单**

Reclaim.ai 应用了诸多经过验证的工程实践。以下列出值得在自研中借鉴的关键概念：

| Reclaim 概念 | 对应自研实现 | 自研改进点 |
| :---- | :---- | :---- |
| Time Defense (Free/Busy) | defensive\_flip() 将任务事件状态翻转 | 可自定义 Slack 阈値（非固定 24h） |
| Heal (Auto-reschedule) | daily\_settlement() 中的 trigger\_heal() | 可针对 IB 学科设置不同慨合策略 |
| Up Next Queue | push\_to\_up\_next() \+ focus\_dashboard.set\_active() | 集成番茄钟，不仅仅是排号 |
| Split up (Task Chunking) | 创建任务时可选择 chunk\_size，自动拆分子任务 | 可为每个子任务添加进度属性 |
| Habits | 用 ScheduleBlock (Layer 1\) 实现，不序则化为个性化时容 | Hard/Soft 防御等级更细腔 |
| Smart Meeting Link | Google Calendar 预流程 \+ Apps Script 表单 | 可邾入 IB 导师颈预约流程 |
| Auto-lock | 将截止日期前 N 天的任务设为 Hard 锁定 | 可根据任务类型和学科设置不同 N 值 |

## **4.3  工具选型容备方案**

| 场景 | 推荐方案 | 原因 |
| :---- | :---- | :---- |
| 初期快速验证概念 | Reclaim.ai Lite 免费版 | 零成本验证工作流，观察哪些功能最有价值 |
| Phase 0-1 开发期间 | 并行使用 Reclaim Free \+ 自研 Sheets MVP | 尿不耐断，双轨并行确保过渡平滑 |
| Phase 2 后全面切换 | 迁移到全自研工具 | 自研功能已覆盖订阅功能，停止 Reclaim 订阅 |
| 发现 Apps Script 算力不足 | 迁移到 Cloud Run \+ Python CSP | 任务数超过 50 项或依赖关系复杂时升级 |
| 需要手机访问 | 自研 Web App 转 PWA | 添加 manifest.json 封装为 PWA，可添加到手机主屏 |

## **4.4  开发资源与工具清单**

| 资源类型 | 具体工具/链接 | 用途 |
| :---- | :---- | :---- |
| API 文档 | Google Calendar API v3 Docs | 日历事件 CRUD 参考 |
| API 文档 | Google Apps Script 参考手册 | 脚本开发、时间触发器、Web App |
| LLM API | Google Gemini API (gemini-1.5-flash) | 邮件解析，免费额度通常足够 |
| LLM API | DeepSeek API (备选) | 成本更低，解析质量相近 |
| 调度库 | Google OR-Tools (Python) | 复杂 CSP 问题求解 |
| 推送 | Slack Incoming Webhooks | 无需 Bot Token，最简单的推送方式 |
| 前端 | Vanilla HTML/CSS/JS 或 Vue 3 CDN | 轻量化 Focus Dashboard，无需构建工具链 |
| 版本控制 | GitHub Private Repo | Apps Script 可用 clasp 实现 Git 同步 |

  **结语：工程思维管理学业**

自研这套工具的过程本身，就是一种对“时间分配问题”的深度思考。它要求你把自己的学业生活抽象成一个可建模的系统，然后用工程的方式进行设计、实现和迭代。这个过程得到的不仅是一个工具，更是对自己时间主权意识的建立。

Reclaim.ai 等工具的应用验证了这套逻辑的可行性，自研则让你拥有完全的控制权和遑定义的能力。

| 🎯 三个核心承诺 1\. 学术卓越：所有 IA、EE 等长周期项目按里程碑交付，不遗漏任何节点 2\. 管理自动化：时间分配由算法决策，学生只需专注产出结果 3\. 心理稳态：任意时刻只需看一眼时间线，就知当前唯一最高优先级任务 |
| :---- |

文档生成日期：2026年3月  | 自研版 v2.0