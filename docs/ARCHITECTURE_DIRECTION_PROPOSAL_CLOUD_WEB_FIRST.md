# TimeWhere 架构方向调整建议（Architecture Direction Proposal）

**状态**: Proposal / Product Owner Direction
**作者来源**: External Architecture Advisor proposal, accepted by Product Owner as direction input
**目标读者**: Product Owner、Codex Architecture、Product&Project Mg
**日期**: 2026-07-10

> 本文是架构方向建议，不是迁移计划，也不是实施批准。它的目的不是告诉 Codex 直接怎么做，而是记录 Product Owner 已确认的新产品方向，供 Codex 后续完成技术方案设计、迁移规划、风险评估和实施计划。

## 1. 背景

随着 TimeWhere 产品定位不断明确，当前以 Chrome Extension、IndexedDB、本地运行时和 Google Drive 数据同步为中心的架构开始出现边界限制。

当前架构适合作为 MVP，但产品定位已经逐步演变为：

> 一个长期运行、持续提醒、智能调度、跨平台的个人时间管理系统。

因此，需要重新评估整体架构方向。本文只提出方向，不包含具体迁移方案。

## 2. 产品定位调整

建议正式将产品定位调整为：

> TimeWhere 是一个以 Cloud 为核心、Web 为主体、Desktop 为主要运行入口的个人时间管理平台。

Chrome Extension 不再作为产品主体，而应调整为产品生态中的浏览器组件。

## 3. 总体架构目标

```text
                    TimeWhere Cloud
                           |
        +------------------+------------------+
        |                  |                  |
   Web Application     Desktop Runtime    Browser Extension
```

目标职责：

- Cloud 负责用户体系、数据、调度、AI、同步和 API。
- Web Application 负责全部业务页面和业务逻辑。
- Desktop Runtime 负责桌面运行环境和系统能力。
- Browser Extension 负责浏览器场景增强能力。

## 4. 职责边界

### Cloud

负责：

- 数据权威
- 用户认证
- API
- AI
- 同步
- 外部系统连接

不负责：

- UI

### Web Application

负责：

- 全部业务页面
- 全部业务逻辑
- Daily Settle
- Calendar
- Task
- Container
- Settings

原则：

> Web Application 应成为唯一业务实现。

### Desktop Runtime

负责：

- Window
- Tray
- Notification
- Auto Start
- Local Secure Storage
- Native Bridge

原则：

> Desktop Runtime 不承载业务逻辑，其生命周期应远慢于 Web Application。

### Browser Extension

建议调整为浏览器增强组件，主要承担：

- 当前网页提醒
- 快速创建任务
- 当前任务查看
- 浏览器使用数据采集
- 打开 Desktop / Web

而不是完整产品主体。

## 5. 数据架构方向

建议重新定义数据权威：

```text
Cloud Database
        |
   Canonical Data
        |
----------------
IndexedDB
Local Cache
```

Cloud Database 成为唯一权威数据。IndexedDB 调整为 Cache、Offline Queue 和 Local Performance Layer，不再作为长期唯一数据源。

## 6. Google 定位

本轮方向只确认账户层：

- 账户体系优先采用 Google 账户单点鉴权。
- Google 在目标架构中是身份提供方之一，优先用于 Google SSO / OIDC 登录。

本轮不设计、不批准：

- Google Drive Sync 迁移方案
- Google Tasks 集成
- Google Calendar 集成
- 以 Google 作为核心业务数据模型

后续如需要 Google Calendar / Tasks / Drive 作为外部连接器，应作为 Cloud Connector 另行设计。

## 7. 平台抽象方向

业务代码原则上不直接依赖 Chrome API、Desktop API 或 Browser API。

目标结构：

```text
Business
   |
Platform Interface
   |
Desktop / Browser / Extension
```

平台能力应通过统一 Platform Adapter 暴露。

## 8. Repository 方向

业务代码不应长期直接访问 IndexedDB。

目标结构：

```text
Business
   |
Repository
   |
Local Cache / Cloud API
```

Repository 层用于解除业务逻辑与具体存储实现的耦合。

## 9. Native 能力方向

仅将 Web 无法可靠实现的能力保留在 Desktop Runtime，包括：

- Notification
- Tray
- Auto Start
- Native Storage
- Background Service
- System Monitoring

业务逻辑原则上不进入 Runtime。

## 10. 发布模型方向

未来应形成两条不同发布生命周期：

- Runtime：低频发布，主要更新 Native 能力、系统兼容和 Runtime Bug。
- Web Application：高频发布，业务 UI、AI、Daily Settle、Calendar、Task、API 调整无需升级客户端。

## 11. 演进原则

1. 业务逻辑唯一，原则上只存在于 Web Application。
2. Cloud 为唯一权威数据。
3. Desktop Runtime 保持最小化。
4. Google 为账户 SSO 优先入口，其他 Google 能力作为外部连接器另行设计。
5. Browser Extension 属于产品生态，而不是产品主体。
6. 平台能力全部经过抽象层。

## 12. 对 Codex 的后续工作建议

本文不包含迁移计划。Codex 应基于上述方向另行输出：

1. 当前架构 Gap Analysis。
2. 可迁移资产评估。
3. 新旧架构 Mapping。
4. 风险分析。
5. 分阶段迁移路线。
6. Repository 与 Platform 抽象方案。
7. 数据迁移策略。
8. 发布策略调整。
9. 文档更新计划。
10. MVP 到目标架构的演进路径。

以上内容属于 Codex 的设计职责，需由 Product Owner 评审和最终决策。

## 13. 决策边界

Product Owner 负责：

- 产品定位
- 架构方向
- 演进目标
- 发布策略
- 范围取舍
- 最终批准迁移

Codex 负责：

- 技术方案设计
- 架构设计
- 迁移规划
- 风险控制
- 实施计划
- 文档落地

External Advisor 负责：

- 架构方向建议
- 外部审查
- 风险识别
- 关键设计评估
- 对 Codex 输出进行独立审查
