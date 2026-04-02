# 设计架构变更记录

**日期**: 2026-04-02  
**版本**: v2.0

---

## 变更概述

本次变更是从 **Google 云优先** 架构转变为 **本地优先 + Chrome Extension** 架构。

### 核心变化

| 变更项 | 原设计 (v1.0) | 新设计 (v2.0) |
|--------|---------------|---------------|
| 技术栈 | Google Apps Script | Chrome Extension (Manifest V3) |
| 主存储 | Google Tasks + Calendar | chrome.storage.local |
| 调度触发 | 自动 Arrange + Daily Settlement | 手动触发 Arrange |
| 多端同步 | Google 多端同步 | 不需要 |
| 任务滑动 | 动态 Healing/Defensive Flip | 放弃 |
| 数据同步 | 实时读取 Google | 本地为主 + 定时同步到 Google |

### 新架构特点

1. **本地优先**: 所有操作在本地完成，无网络延迟
2. **手动调度**: 用户主动触发 Arrange，保留调度算法逻辑
3. **Google 作为备份**: 定时同步到 Google Tasks/Calendar 作为数据备份
4. **初始化导入**: 首次启动从 Google 导入已有数据

---

## 新架构数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        首次启动                              │
│   Google Tasks + Calendar → chrome.storage.local            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        日常使用                              │
│                                                             │
│   User Action → localStorage → Sync Engine → Google        │
│       ↑                                         ↓          │
│       └───────────────────────────────────── (定时拉取)     │
└─────────────────────────────────────────────────────────────┘
```

---

## 保留的设计元素

以下设计概念在新架构中仍然有效：

1. **五大核心实体**: Event, Time Container, Task, Habit, Reminder
2. **时间容器概念**: 学习/自由/睡前三类容器
3. **Task 模型**: 包含 priority, bucket, subject, duration 等属性
4. **Arrange 调度算法**: 保留逻辑，改为手动触发
5. **Habit 模型**: 不参与调度，只记录完成状态

---

## 移除的设计元素

1. **Daily Settlement 自动排序**: 改为手动
2. **Defensive Flip / Healing**: 放弃动态滑动
3. **多端同步**: 不需要
4. **Apps Script 后端**: 替换为 Extension 前端 + Sync Engine

---

## 实现优先级

| Phase | 内容 | 对应 Milestone |
|-------|------|----------------|
| 1 | Extension 脚手架 + 本地存储 + 基础 UI | v1.0 - 基础框架 |
| 2 | Focus Dashboard + Task Board + Container Config + Settings | v1.1 - UI 模块 |
| 3 | 初始化导入 + 定时同步 + 冲突处理 | v1.2 - Google Sync |
| 4 | 手动触发 Arrange + 调度算法 UI | v1.3 - 手动 Arrange |
| 5 | Gmail 解析 + Reminder | v2.0 - 后续功能 |

---

## 相关文件

| 文件 | 说明 |
|------|------|
| `archive/v1.0_google-based/` | 原设计文档（Apps Script 架构） |
| `C:\Users\willi\.local\share\opencode\plans\TECH_PLAN_EVALUATION.md` | 技术方案评估报告 |

---

**最后更新**: 2026-04-02
