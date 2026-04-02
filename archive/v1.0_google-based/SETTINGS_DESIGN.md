# Settings 模块详细设计

## 1. 模块概述

Settings 模块负责系统配置管理和初始化。

```
┌─────────────────────────────────────────────────────────┐
│                   Settings 模块                           │
├─────────────────────────────────────────────────────────┤
│  配置管理     │  初始化向导     │  用户设置              │
│  - 系统配置   │  - 首次设置    │  - 个人偏好           │
│  - 容器配置   │  - 数据迁移    │  - 通知设置           │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 功能定义

### 2.1 配置管理

| 配置项 | 说明 | 存储位置 |
|--------|------|----------|
| 系统配置 | 调度参数、防御阈值等 | Sheets |
| 时间容器配置 | 容器的默认时间 | Calendar |
| 用户配置 | 主题、通知偏好等 | Sheets |

### 2.2 初始化向导

| 步骤 | 内容 |
|------|------|
| 1 | Google 账号授权 |
| 2 | 创建默认时间容器 |
| 3 | 设置课表（如有） |
| 4 | 创建默认 Plan |
| 5 | 选择模板（可选） |

### 2.3 用户设置

| 设置项 | 说明 |
|--------|------|
| 主题 | 浅色/深色 |
| 番茄钟时长 | 25min（默认）/ 自定义 |
| 通知设置 | 开启/关闭 |
| 周起始日 | 周一/周日 |

---

## 3. 配置数据模型

### 3.1 系统配置 (SystemConfig)

```typescript
interface SystemConfig {
  // 调度配置
  scheduler: {
    arrange_trigger: 'manual' | 'auto';
    daily_interval_minutes: number;
    heal_time: string;          // "23:00"
    defensive_threshold_hours: number;  // 24
  };
  
  // 容器配置
  containers: {
    default_learning: ContainerDefault;
    default_free: ContainerDefault;
    default_bedtime: ContainerDefault;
  };
  
  // 提醒配置
  reminders: {
    enabled: boolean;
    before_deadline_minutes: number;
  };
  
  // 用户配置
  user: {
    week_starts_on: 0 | 1;  // 0=周日, 1=周一
    tomato_duration: number;   // 分钟
    theme: 'light' | 'dark';
    notifications_enabled: boolean;
  };
  
  // 版本信息
  version: string;
  initialized_at: Date;
  updated_at: Date;
}

interface ContainerDefault {
  enabled: boolean;
  start_time: string;
  end_time: string;
  repeat: 'daily' | 'weekday' | 'weekend';
}
```

### 3.2 配置存储结构 (Sheets)

```
配置表 (IB-Config)
├── Sheet: SystemConfig
│   ├── key | value
│   ├── scheduler.arrange_trigger | manual
│   └── ...
│
├── Sheet: UserPreferences
│   ├── key | value
│   ├── theme | light
│   └── ...
│
├── Sheet: ContainerDefaults
│   ├── name | start | end | repeat | enabled
│   ├── 学习时间 | 18:30 | 21:30 | weekday | true
│   └── ...
│
└── Sheet: InitLog
    ├── step | status | timestamp
    ├── auth | completed | 2026-03-31
    └── ...
```

---

## 4. 服务设计

### 4.1 配置服务 (ConfigService)

```typescript
// services/configService.ts

class ConfigService {
  private sheets: SheetsStore;
  private SPREADSHEET_ID: string;
  
  constructor(sheets: SheetsStore) {
    this.sheets = sheets;
    this.SPREADSHEET_ID = getConfigSpreadsheetId();
  }
  
  // 获取完整配置
  getConfig(): SystemConfig {
    const system = this.readSection('SystemConfig');
    const user = this.readSection('UserPreferences');
    const containers = this.readSection('ContainerDefaults');
    return this.mergeConfig(system, user, containers);
  }
  
  // 更新配置
  updateConfig(updates: Partial<SystemConfig>): void {
    // 更新各配置节
  }
  
  // 获取用户偏好
  getUserPreferences(): UserPreferences {
    return this.readSection('UserPreferences');
  }
  
  // 更新用户偏好
  updateUserPreferences(prefs: Partial<UserPreferences>): void {
    this.writeSection('UserPreferences', prefs);
  }
  
  // 获取容器默认配置
  getContainerDefaults(): ContainerDefault[] {
    return this.readSection('ContainerDefaults');
  }
  
  // 检查是否已初始化
  isInitialized(): boolean {
    const log = this.readSection('InitLog');
    return log.some(entry => entry.step === 'complete');
  }
  
  // 私有方法
  private readSection(sheetName: string): Record<string, any>[] { ... }
  private writeSection(sheetName: string, data: Record<string, any>): void { ... }
}
```

### 4.2 初始化服务 (InitService)

```typescript
// services/initService.ts

interface InitStep {
  step: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  message?: string;
}

class InitService {
  private configService: ConfigService;
  private calendarStore: CalendarStore;
  private taskStore: TaskStore;
  
  constructor(configService: ConfigService) { ... }
  
  // 运行初始化向导
  async runWizard(): Promise<InitResult> {
    const steps: InitStep[] = [];
    
    // 步骤 1: 授权检查
    steps.push(await this.checkAuth());
    
    // 步骤 2: 创建配置表
    steps.push(await this.createConfigSpreadsheet());
    
    // 步骤 3: 创建默认容器
    steps.push(await this.createDefaultContainers());
    
    // 步骤 4: 创建默认 Plan
    steps.push(await this.createDefaultPlans());
    
    // 步骤 5: 记录完成
    steps.push(await this.completeInit());
    
    return { success: true, steps };
  }
  
  // 检查授权状态
  private async checkAuth(): Promise<InitStep> {
    try {
      // 尝试读取 Calendar
      this.calendarStore.getCalendars();
      return { step: 'auth', status: 'completed' };
    } catch (e) {
      return { step: 'auth', status: 'failed', message: '需要授权' };
    }
  }
  
  // 创建配置表
  private async createConfigSpreadsheet(): Promise<InitStep> {
    const ss = this.sheets.createSpreadsheet('IB-AMS Config');
    // 创建各配置节
    return { step: 'config', status: 'completed' };
  }
  
  // 创建默认容器
  private async createDefaultContainers(): Promise<InitStep> {
    const defaults = this.configService.getContainerDefaults();
    for (const container of defaults) {
      if (container.enabled) {
        await this.calendarStore.createContainer(container);
      }
    }
    return { step: 'containers', status: 'completed' };
  }
  
  // 创建默认 Plan
  private async createDefaultPlans(): Promise<InitStep> {
    // 创建 "Inbox" Plan
    // 创建 "Habit" Plan
    return { step: 'plans', status: 'completed' };
  }
  
  // 完成初始化
  private async completeInit(): Promise<InitStep> {
    this.configService.updateConfig({
      initialized_at: new Date(),
      version: CURRENT_VERSION
    });
    return { step: 'complete', status: 'completed' };
  }
  
  // 获取初始化状态
  getInitStatus(): InitStatus {
    return {
      is_initialized: this.configService.isInitialized(),
      completed_steps: this.getCompletedSteps(),
      current_step: this.getCurrentStep()
    };
  }
}
```

---

## 5. 页面设计

### 5.1 设置页面 (settings.html)

```
┌─────────────────────────────────────────────────────────┐
│  ← 返回                    设置                      [保存] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  通用                                                    │
│  ├─ 主题                    [浅色 ▾]                   │
│  ├─ 周起始日                [周一 ▾]                   │
│  └─ 番茄钟时长              [25] 分钟                   │
│                                                         │
│  通知                                                    │
│  ├─ 启用通知                [✓]                       │
│  └─ 截止前提醒              [15] 分钟                  │
│                                                         │
│  调度                                                    │
│  ├─ Arrange 触发方式        [手动 ▾]                   │
│  ├─ 防御翻转阈值            [24] 小时                  │
│  └─ 每日结算时间            [23:00]                   │
│                                                         │
│  数据                                                    │
│  ├─ 导出数据                                            │
│  ├─ 重置配置                                            │
│  └─ 重新初始化                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 初始化向导 (init.html)

```
┌─────────────────────────────────────────────────────────┐
│                     IB-AMS 初始化向导                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────┐                                           │
│  │    1    │  授权 Google 账号                         │
│  └─────────┘                                           │
│      ↓                                                  │
│  ┌─────────┐                                           │
│  │    2    │  创建时间容器                             │
│  └─────────┘                                           │
│      ↓                                                  │
│  ┌─────────┐                                           │
│  │    3    │  设置课表（可选）                         │
│  └─────────┘                                           │
│      ↓                                                  │
│  ┌─────────┐                                           │
│  │    4    │  完成                                     │
│  └─────────┘                                           │
│                                                         │
│              [开始初始化]                                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 6. 模块清单

### 6.1 manifest.json

```json
{
  "module_id": "settings",
  "module_name": "Settings Module",
  "version": "1.0.0",
  "description": "系统配置与初始化模块",
  "dependencies": ["framework"],
  "entry_point": "settings/settings.html",
  "permissions": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/calendar"
  ],
  "features": {
    "config_management": true,
    "init_wizard": true,
    "data_export": true
  }
}
```

---

## 7. 入口设计

### 7.1 设置入口

每个模块页面右上角提供设置入口：

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                              [⚙️ 设置] [👤] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                    Focus 主界面                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 7.2 URL 路由

```
/settings        → settings/settings.html
/settings/init   → settings/init.html
/settings/containers → settings/containers.html
/settings/scheduler → settings/scheduler.html
```

---

## 8. 总结

| 功能 | 说明 |
|------|------|
| 配置管理 | 系统配置、用户偏好、容器默认 |
| 初始化向导 | 首次使用的引导流程 |
| 设置页面 | 统一配置入口 |
| 数据管理 | 导出、重置 |

**与其他模块的关系**：
- Framework: 提供数据存储能力
- Dashboard: 提供设置入口
- Calendar: 容器配置同步
