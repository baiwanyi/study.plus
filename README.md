# 学迹Plus

> 智能学习管理，让成长有迹可循，使每一分都闪闪发光。
> Smart learning management makes growth traceable and every point shine.

## 项目概述

### 项目背景

通过积分奖惩机制培养孩子的学习习惯和自律性，打造一个集习惯管理、积分激励、作业提交与评分于一体的智能学习管理工具。

**核心功能：**

- **积分奖惩管理**：创建作业，完成作业获得积分，积分可用于兑换奖励
- **作业提交与评分**：上传作文/思维导图，获得评分（AI评分）
- **积分兑换**：支持兑娱乐时间、现金等奖励

### 产品定位

一款面向 **3-15岁** 孩子的家庭，以积分制为核心，帮助家长管理孩子学习习惯，同时支持孩子在线提交作文/思维导图并获得评分的轻量级工具。

## 技术栈

| 类别     | 技术选型                         | 说明                            |
|----------|----------------------------------|---------------------------------|
| 前端框架 | React 19 + Vite 6 + TypeScript   | SPA 单页应用                    |
| UI 组件  | Tailwind CSS 3                   | 原子化 CSS，响应式设计          |
| 图标库   | Lucide React                     | 轻量级 SVG 图标库               |
| Markdown | @uiw/react-md-editor             | Markdown 编辑器+实时预览        |
| 思维导图 | Mermaid.js 11                    | Markdown 语法渲染思维导图       |
| 路由     | React Router 7                   | 客户端路由                      |
| 后端服务 | Node.js + Express + TypeScript   | Web 服务 + RESTful API          |
| AI 评分  | DeepSeek API                     | 作文/思维导图 AI 评分 + AI 起名 |
| 数据库   | SQLite (libSQL / @libsql/client) | 轻量级本地数据库，兼容 Turso 云 |
| ORM      | Drizzle ORM                      | 类型安全的 SQL 查询构建器       |

### 项目架构

这是一个**前后端一体化**的单仓库项目，采用以下架构：

- **前端**：React 19 + Vite 6，运行在端口 5173
- **后端**：Express + TypeScript，运行在端口 3001
- **数据库**：SQLite 本地数据库，使用 Drizzle ORM 进行数据操作
- **开发模式**：通过 Vite 代理配置将 `/api` 请求转发到 Express 后端
- **构建部署**：Vite 构建前端，TypeScript 编译后端，统一部署

## 功能需求

### 1. 作业提交与评分

#### 1.1 编辑器

- 使用 `@uiw/react-md-editor` Markdown 编辑器，支持实时预览
- 支持思维导图编辑（基于 Mermaid 语法渲染）
- 自动保存功能（可通过 `AUTOSAVE_INTERVAL` 环境变量配置间隔秒数）

#### 1.2 AI 评分

- 集成 DeepSeek API 进行智能评分与 AI 起名
- 作文项目：如有题目则根据题目进行评判，如无题目则根据内容进行评判
- 思维导图项目：如有题目则根据题目进行评判，如无题目则根据内容进行评判
- 评分结果附带评语和改进建议

#### 1.3 评分标准（统一作业评分）

| 等级 | 积分变化 | 说明           |
|------|----------|----------------|
| A+   | +50 分   | 优秀，超出预期 |
| A    | +20 分   | 良好，符合要求 |
| B    | +10 分   | 合格，基本达标 |
| C    | -5 分    | 需改进         |
| D    | -10 分   | 不合格，需重做 |
| E    | -50 分   | 未完成         |

### 2. 积分奖惩管理

#### 2.1 基础规则

| 规则         | 积分变化            | 说明                 |
|--------------|---------------------|----------------------|
| 每月初始积分 | 可配置，默认 500 分 | 规则配置页可修改     |
| 特权最低积分 | 可配置，默认 100 分 | 低于此值限制兑换特权 |
| 作业未完成   | -50 分              | 评分等级为 E         |

> 💡 月初始积分和特权最低积分均可在「规则配置」页面自定义修改。

#### 2.2 单元测评

| 分数区间   | 积分变化 |
|------------|----------|
| 60 分以下  | -50 分   |
| 60 - 69 分 | -20 分   |
| 70 - 79 分 | -10 分   |
| 80 - 89 分 | +10 分   |
| 90 - 95 分 | +20 分   |
| 95 分以上  | +50 分   |

#### 2.3 额外完成

| 项目       | 条件                    | 积分变化  |
|------------|-------------------------|-----------|
| 练习册     | 错题少于 5 题且订正完毕 | +10 分/课 |
| 单元测试卷 | 80 分以上且订正完毕     | +20 分    |

#### 2.4 积分兑换

| 兑换项   | 兑换比例（默认）     | 说明                     |
|----------|----------------------|--------------------------|
| 娱乐时间 | 1 积分 = 10 分钟     | 兑换比例可在规则配置修改 |
| 现金兑换 | 10 积分 = 1 元人民币 | 兑换比例可在规则配置修改 |

> ⚠️ 月初积分少于特权最低积分（默认 100 分），则当月手机、平板、电视均无法使用。

#### 2.5 月度结算

- 每月 1 日统计上月加/扣分情况，得到本月可用积分
- 结算公式：`本月可用积分 = 月初始积分 + 上月净积分变化`（月初始积分默认 500，可配置）
- 结算后积分 < 特权最低积分时触发限制规则

#### 2.6 规则配置

- 所有规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在数据库 `options` 表，按类别分 key 存储（homework、exam、exchange、custom、system）

### 3. 页面功能

#### 3.1 首页看板

- 本月积分统计（加分/扣分/净变化/余额）
- 待完成作业列表
- 积分规则速览（评分标准+兑换比例）
- 快速添加积分记录

#### 3.2 作业管理

- 作业列表（名称/类型/评语/积分/状态/时间）
- Markdown 编辑器编辑提交内容
- AI 评分（DeepSeek 自动评分+积分计算）
- AI 起名（根据内容自动生成任务标题，仅限「未命名」开头的任务）
- 作业创建/编辑/删除
- 作业名称为空时自动命名为「未命名作文作业」或「未命名思维导图作业」

#### 3.3 侧边栏

- 导航菜单（Lucide React 图标）
- 随机学习名言展示（从经典名言中随机显示）

#### 3.4 积分记录

- 所有加扣分记录列表，按时间倒序
- 筛选功能（类型/时间/规则类别）
- 月度汇总统计
- 添加记录时备注支持快捷选项（可自定义，每行一个，保存到本地）

#### 3.5 兑换记录

- 所有兑换历史记录，按时间倒序
- 支持兑换看电视、用设备、换现金
- 撤销功能（积分退回）
- 筛选功能

#### 3.6 AI 使用记录

- DeepSeek API 调用记录（使用项目/任务名称/使用时间/Token 用量）
- 按项目汇总统计（AI评分/AI起名）
- 总调用次数与总 Token 消耗概览

#### 3.7 规则配置

- 所有规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在数据库 `options` 表，按类别分 key 存储（homework、exam、exchange、custom、system）
- 规则分类展示：作业评分规则、考试分数规则、兑换规则、自定义规则、系统规则

#### 3.8 设置选项

- 系统设置配置
- 规则配置页面入口
- 帮助文档链接

### 4. 数据看板

- 月度积分趋势图
- 作业完成率统计
- 各科目评分分布
- 积分收支明细

## 数据结构设计

### 核心数据模型

```
tasks          -> id, title, type(composition/mindmap), status(pending/completed/expired), createdAt
submissions    -> id, taskId(FK), content, grade(A+/A/B/C/D/E), aiScore, scoredAt, createdAt
point_records  -> id, type(earn/deduct), amount, reason, ruleName, relatedId, relatedType(task/submission/exam/extra/custom), createdAt
exchanges      -> id, itemType, pointsCost, detail, status(active/revoked), createdAt
options    -> id, key(unique), value
ai_usage_logs  -> id, project, taskTitle, promptTokens, completionTokens, totalTokens, createdAt
month_summary  -> id, month(unique), basePoints(500), totalEarn(0), totalDeduct(0), balance(500)
```

## 项目结构

```
study.webian.dev/
├── apps/                         # 后端代码和共享组件
│   ├── components/              # 共享组件
│   │   ├── DataTable.tsx       # 数据表格组件
│   │   ├── Layout.tsx          # 布局（侧边栏+主内容区+随机名言）
│   │   ├── Loading.tsx         # 加载组件
│   │   ├── Modal.tsx           # 模态框组件
│   │   ├── RulesPage.tsx       # 规则配置页面
│   │   ├── Snackbar.tsx        # 全局消息提示组件
│   │   └── Tabs.tsx            # 标签页组件
│   ├── db/                     # 数据库相关
│   │   ├── default.ts          # 默认配置
│   │   ├── index.ts            # 数据库连接
│   │   ├── migrate.ts          # 迁移脚本
│   │   └── schema.ts           # Drizzle ORM Schema
│   ├── lib/                    # 工具库
│   │   ├── api.ts              # API请求封装
│   │   ├── react-md-editor.d.ts # Markdown编辑器类型定义
│   │   ├── types.ts            # TypeScript类型定义
│   │   └── utils.ts            # 工具函数
│   ├── routes/                 # API路由
│   │   ├── ai-usage.ts         # AI使用记录API
│   │   ├── exchanges.ts        # 兑换记录API
│   │   ├── options.ts          # 选项配置API
│   │   ├── points.ts           # 积分记录API
│   │   ├── rules-loader.ts     # 规则加载与初始化
│   │   ├── summary-helper.ts   # 月度汇总辅助
│   │   └── tasks.ts            # 作业API（含AI评分/起名）
│   ├── services/               # 业务逻辑
│   │   ├── ai.ts               # DeepSeek API封装（评分+起名+使用记录）
│   │   └── points.ts           # 积分计算服务
│   ├── index.tsx               # React入口（前端）
│   └── server.ts               # Express服务器入口
├── pages/                       # 前端页面组件
│   ├── layout/                 # 布局和子组件
│   │   ├── AIListTable.tsx     # AI记录列表表格
│   │   ├── AISummaryCards.tsx  # AI使用统计卡片
│   │   ├── AISummaryTable.tsx  # AI使用汇总表格
│   │   ├── ExchangesListTable.tsx # 兑换记录列表表格
│   │   ├── ExchangesModalAdd.tsx # 添加兑换记录模态框
│   │   ├── ExchangesStatsCards.tsx # 兑换统计卡片
│   │   ├── Help.tsx            # 帮助组件
│   │   ├── OptionsRulesCustom.tsx # 自定义规则组件
│   │   ├── OptionsRulesExam.tsx # 考试规则组件
│   │   ├── OptionsRulesExchange.tsx # 兑换规则组件
│   │   ├── OptionsRulesHomework.tsx # 作业规则组件
│   │   ├── OptionsSystem.tsx   # 系统设置组件
│   │   ├── PointsListTable.tsx # 积分记录列表表格
│   │   ├── PointsModalAdd.tsx  # 添加积分记录模态框
│   │   ├── PointsStatsCards.tsx # 积分统计卡片
│   │   ├── TaskEdit.tsx        # 作业编辑组件
│   │   ├── TaskListTable.tsx   # 作业列表表格
│   │   ├── TaskModalAIResult.tsx # AI评分结果模态框
│   │   ├── TaskModalAIScore.tsx # AI评分模态框
│   │   ├── TaskModalCreate.tsx # 创建作业模态框
│   │   ├── TaskModalEdit.tsx   # 编辑作业模态框
│   │   ├── WidgetBalance.tsx   # 余额组件
│   │   ├── WidgetCustomRules.tsx # 自定义规则组件
│   │   ├── WidgetExamScoreRules.tsx # 考试分数规则组件
│   │   ├── WidgetExchangeRules.tsx # 兑换规则组件
│   │   ├── WidgetHomeworkGradeRules.tsx # 作业评分规则组件
│   │   ├── WidgetPendingTasks.tsx # 待处理作业组件
│   │   └── WidgetStats.tsx     # 统计组件
│   ├── AIUsage.tsx             # AI使用记录页面
│   ├── Dashboard.tsx           # 首页看板
│   ├── Exchanges.tsx           # 兑换记录页面
│   ├── index.css               # 全局样式
│   ├── Options.tsx             # 设置选项页面
│   ├── Points.tsx              # 积分记录页面
│   └── Tasks.tsx               # 作业管理页面
├── data/                        # SQLite数据库文件
├── public/                      # 静态资源
│   ├── docs/                   # 文档
│   │   ├── faq.md              # 常见问题文档
│   │   ├── markdown.md         # Markdown语法参考文档
│   │   └── mermaid.md          # Mermaid图表语法参考文档
│   └── favicon.svg             # 网站图标
├── .env                         # 环境变量（不提交到仓库）
├── .gitignore                   # Git忽略配置
├── eslint.config.js            # ESLint配置
├── index.html                   # HTML入口文件
├── package.json                 # 项目配置
├── postcss.config.js           # PostCSS配置
├── tailwind.config.js          # Tailwind CSS配置
├── tsconfig.json               # TypeScript配置
└── vite.config.ts              # Vite构建配置
```

## 开发计划

### Phase 1 - 基础框架（MVP）

- [x] 项目初始化（Express + React）
- [x] SQLite 数据库初始化与 ORM 配置
- [x] 基础页面布局（侧边栏导航）
- [x] 积分规则配置与展示

### Phase 2 - 核心功能

- [x] 作业创建与管理
- [x] 作业提交与自评
- [x] DeepSeek AI 评分集成
- [x] DeepSeek AI 起名功能
- [x] DeepSeek API 使用记录
- [x] Markdown 编辑器集成（@uiw/react-md-editor）
- [x] 思维导图编辑支持（Mermaid.js）
- [x] Lucide React 图标库替换内联 SVG
- [x] 全局消息提示组件（Snackbar）
- [x] 侧边栏随机学习名言展示

### Phase 3 - 积分系统

- [x] 积分自动计算（统一作业评分标准，含 A+ 等级 +50 分）
- [x] 月度结算逻辑
- [x] 积分兑换功能（娱乐/现金）
- [x] 规则配置可自定义（月初始积分、特权最低积分、兑换比例）
- [x] 兑换记录正确匹配规则配置的兑换比例

### Phase 4 - 文档与体验优化

- [x] Markdown 语法参考文档（public/docs/markdown.md）
- [x] Mermaid 图表语法参考文档（public/docs/mermaid.md）
- [x] 常见问题文档（public/docs/faq.md）

## 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 如果没有 .env.example，请参考下方「环境变量」手动创建 .env

# 初始化数据库
npm run db:migrate

# 同时启动前后端开发服务器
npm run dev:all

# 或分别启动
npm run start            # 启动后端（端口3001）
npm run dev              # 启动前端（端口5173）
```

### 环境变量

在项目根目录创建 `.env` 文件：

```env
# DeepSeek API
DEEPSEEK_API_KEY=你的API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 服务端口
PORT=3001

# 数据库路径
DB_PATH=./data/study.db

# 自动保存间隔（秒）
AUTOSAVE_INTERVAL=10
```

> ⚠️ `.env` 文件已在 `.gitignore` 中配置，不会被提交到仓库。请勿将 API 密钥硬编码或提交到版本控制。

## 许可证

MIT License
