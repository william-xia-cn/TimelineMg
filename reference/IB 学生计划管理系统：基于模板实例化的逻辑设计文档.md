# **IB 学生计划管理系统设计文档：计划实例化与自定义逻辑**

## **1\. 计划模型层次逻辑 (Plan-Centric Hierarchy)**

系统严格遵循 Planner 的扁平化容器结构，确保不同学科和核心组件（EE/CAS/TOK）在逻辑上相互隔离。

* **Plan Template (计划模板):** 静态的业务蓝图。包含预设的 Bucket 名称、排序逻辑以及可选的引导性任务（Skeleton Tasks）。  
* **Plan Instance (计划实例):** 动态的执行实体。由模板克隆而来，或从空白创建。一旦生成，其结构（Bucket 的增删改）与原模板脱钩。  
* **Bucket (任务桶):** 计划内的第一级分类属性。逻辑上是任务的一个 BucketID 外键。  
* **Task (任务):** 最小操作单元。承载 IB 业务元数据。

## ---

**2\. 计划创建与修订逻辑定义**

### **2.1 实例化流程 (Template Instantiation)**

当学生发起“新建计划”时，系统提供两条路径：

1. **路径 A：按模板创建 (Use Template)**  
   * **选择:** 学生从“IB 模板库”选择（如：EE 模板）。  
   * **克隆:** 系统读取 TemplateID 关联的 DefaultBuckets 列表，在 PlanInstance 表中生成对应的记录。  
   * **初始化:** 如果模板包含“必做任务”（如 EE 的三次反映会议），这些任务会自动分配到对应的 Bucket 中。  
2. **路径 B：自定义/空白创建 (Blank Plan)**  
   * **默认状态:** 系统仅创建一个名为 "To Do" 的默认任务桶。  
   * **自由定义:** 学生完全自主添加 Bucket 和任务。

### **2.2 修订与解耦逻辑 (Post-Creation Flexibility)**

* **自由编辑:** 实例化后的计划实例是“可塑的”。学生可以：  
  * 重命名、删除或重新排序来自模板的 Bucket 4。  
  * 修改预设任务的截止日期、检查列表或元数据。  
* **独立性:** 对实例的修改**不会**反向影响模板，也不会影响其他同学按同一模板创建的计划。

## ---

**3\. IB 专项模板库定义 (Standard Templates)**

根据 IB 业务需求，预设以下四类核心模板，用于快速引导学生：

| 模板名称 | 预设 Bucket 结构 (默认属性) | 预设核心任务 (Skeleton Tasks) |
| :---- | :---- | :---- |
| **学科 IA 模板** | 选题与计划 | 实验/数据采集 | 分析与撰写 | 反馈与修订 | 提交初稿、导师会议记录、字数自查。 |
| **EE 专项模板** | 研究准备 | 初稿写作 | 中期审查 | 终稿完善 | 三次正式反映 (RPPF 节点)、Viva Voce 面试。 |
| **CAS 经历模板** | 调查与准备 | 行动记录 | 反映与证据 | 成果展示 | 7 项学习成果勾选、媒体证据上传。 |
| **TOK 展览模板** | 物件选择 | Prompt 阐释 | 文稿撰写 | 展览准备 | 知识问题关联任务、950 字限制检查 。 |

## ---

**4\. 任务实体 (Task Entity) 属性定义**

为了支撑后续管理，任务对象需具备以下核心字段：

### **4.1 基础属性 (Planner 标准)**

* ID, PlanID, BucketID (归属关系)  
* Title, Description (基本描述)  
* Status (未开始/进行中/已完成)  
* Priority (低/中/重要/紧急)  
* DueDateTime (截止时间)  
* Checklist (子步骤列表)

### **4.2 IB 扩展属性 (元数据承载)**

* **SubjectID:** 关联学科（如果是学科计划，此项由计划级继承）。  
* **WordCountLimit:** 针对 IA/EE 任务的字数上限约束 。  
* **LO\_Tags:** (仅限 CAS) 关联 7 项学习成果。  
* **EvidenceLink:** 存储学生上传的工件链接（PDF/图片/视频） 1。  
* **CriteriaRef:** 关联评估准则 (如 Criterion A, B...) 。

## ---

**5\. 交互逻辑：以 Bucket 为中心的看板视图 (Kanban Design)**

* **分列显示:** 视图层根据任务的 BucketID 进行横向分列排列 3。  
* **拖拽修订:**  
  * 拖拽任务卡片在不同 Bucket 间移动，本质是修改任务的 BucketID 属性 5。  
  * 支持“按桶排序”、“按进度排序”、“按优先级排序”的视图切换 7。  
* **容器自定义:** 界面提供“添加新桶”按钮，支持学生根据个人习惯（如按“本周完成”、“延迟处理”）扩展原有模板结构。

## ---

**6\. 系统设计总结**

本设计通过\*\*“模板定义骨架，实例承载数据”\*\*的模式，既保留了 IB 官方建议的最佳实践（模板），又赋予了学生 Planner 级别的自由度。

1. **计划即沙盒:** 每个计划是独立的协作或个人空间。  
2. **任务即载体:** 任务属性不仅是进度，更是 IB 评估所需的“证据”与“元数据”。  
3. **模板即引导:** 模板不再是约束，而是减少初学者“冷启动”成本的工具。

#### **引用的著作**

1. TOK Essay strategy — TOK RESOURCE.ORG 2026, 访问时间为 三月 30, 2026， [https://www.tokresource.org/tok-essay-strategy](https://www.tokresource.org/tok-essay-strategy)  
2. Step-by-step: The IB Extended Essay Process | Lanterna Education, 访问时间为 三月 30, 2026， [https://info.lanterna.com/resources/the-10-stages-of-writing-your-extended-essay](https://info.lanterna.com/resources/the-10-stages-of-writing-your-extended-essay)  
3. Microsoft Planner \- Creating Buckets and Tasks – DotCIO \- IT Services and Support Center, 访问时间为 三月 30, 2026， [https://itssc.rpi.edu/hc/en-us/articles/19379074676109-Microsoft-Planner-Creating-Buckets-and-Tasks](https://itssc.rpi.edu/hc/en-us/articles/19379074676109-Microsoft-Planner-Creating-Buckets-and-Tasks)  
4. Create buckets to sort your tasks \- Microsoft Support, 访问时间为 三月 30, 2026， [https://support.microsoft.com/en-au/office/create-buckets-to-sort-your-tasks-238af119-3c2b-4cbb-a124-29da99488139](https://support.microsoft.com/en-au/office/create-buckets-to-sort-your-tasks-238af119-3c2b-4cbb-a124-29da99488139)  
5. IB Core Demystified: TOK, EE, CAS Explained \- Lanterna Education, 访问时间为 三月 30, 2026， [https://info.lanterna.com/resources/ib-core-demystified](https://info.lanterna.com/resources/ib-core-demystified)  
6. Reflecting and the IBDP Extended Essay: The RRS & 3 Formal Reflections, 访问时间为 三月 30, 2026， [https://www.theroamingscientist.com/post/reflecting-and-the-ibdp-extended-essay-the-rrs-3-formal-reflections](https://www.theroamingscientist.com/post/reflecting-and-the-ibdp-extended-essay-the-rrs-3-formal-reflections)  
7. IB DP core components explained: TOK, EE & CAS Made Simple, 访问时间为 三月 30, 2026， [https://ib-dp.com/ibdp-core-components-explained-tok-ee-cas/](https://ib-dp.com/ibdp-core-components-explained-tok-ee-cas/)  
8. CCS Extended Essay \- Reflecting and the RPPF, 访问时间为 三月 30, 2026， [https://sites.google.com/a/ccsbali.com/ccs-extended-essay/term-4-1](https://sites.google.com/a/ccsbali.com/ccs-extended-essay/term-4-1)