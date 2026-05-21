# 学迹Plus

> 智能学习管理，让成长有迹可循，使每一分都闪闪发光。
> Smart learning management makes growth traceable and every point shine.

## 项目概述

### 项目背景

通过积分奖惩机制培养孩子的学习习惯和自律性，打造一个集习惯管理、积分激励、作业提交与评分、积分预支与分享于一体的智能学习管理工具。

**核心功能：**

- **积分奖惩管理**：创建作业，完成作业获得积分，积分可用于兑换奖励或预支
- **作业提交与评分**：编写 Markdown 内容/思维导图，获得 DeepSeek AI 评分
- **积分兑换与预支**：支持兑娱乐时间、现金等奖励，支持积分预支与分期还款
- **AI 智能辅助**：AI 评分、AI 起名、AI 出题，全链路智能支持
- **学习分享**：一键生成分享卡片，记录成长瞬间
- **本地视频播放**：扫描本地目录，随机轮播视频，支持续播、收藏、键盘/鼠标控制

### 产品定位

一款面向 **3-15岁** 孩子的家庭，以积分制为核心，帮助家长管理孩子学习习惯，同时支持孩子在线提交作文/思维导图并获得 AI 评分、积分兑换与预支的轻量级工具。

## 技术栈

| 类别     | 技术选型                                | 说明                                 |
|----------|-----------------------------------------|--------------------------------------|
| 前端框架 | React 19 + Vite 8 + TypeScript 6        | SPA 单页应用                         |
| CSS      | Tailwind CSS 4                          | 原子化 CSS，自定义色板               |
| 图标库   | Lucide React                            | 轻量级 SVG 图标库                    |
| Markdown | @uiw/react-md-editor                    | Markdown 编辑器 + 实时预览           |
| 思维导图 | Mermaid.js 11                           | Markdown 语法渲染思维导图            |
| 路由     | React Router 7                          | 客户端路由                           |
| 后端服务 | Node.js + Express 5 + TypeScript        | RESTful API                          |
| 编译优化 | React Compiler (Babel 插件)             | 自动记忆化编译优化                   |
| AI 评分  | DeepSeek API                            | 作文/思维导图 AI 评分 + AI 起名/出题 |
| 数据库   | SQLite (libSQL / @libsql/client)        | 轻量级本地数据库                     |
| ORM      | Drizzle ORM + Drizzle Kit               | 类型安全的 SQL 查询构建器 + 迁移工具 |
| 视频播放 | HTML5 `<video>` + react-player          | 原生视频播放器，支持 Range 请求      |
| 图片导出 | html-to-image                           | DOM 节点截图生成分享卡片             |
| 测试     | Vitest + @testing-library/react + jsdom | 单元测试 + 组件测试 + 集成测试       |

### 项目架构

这是一个**前后端一体化**的单仓库项目，采用以下架构：

- **前端**：React 19 + Vite 8，运行在端口 5173
- **后端**：Express 5 + TypeScript 6，运行在端口 3006
- **数据库**：SQLite 本地数据库 (`data/study.db`)，使用 Drizzle ORM 进行数据操作
- **开发模式**：通过 Vite 代理配置将 `/api` 请求转发到 Express 后端
- **构建部署**：Vite 构建前端，TypeScript 编译检查，统一部署

## 功能需求

### 1. 作业提交与评分

#### 1.1 编辑器

- 使用 `@uiw/react-md-editor` Markdown 编辑器，支持实时预览
- 支持思维导图编辑（基于 Mermaid 语法渲染）
- 自动保存功能（可通过 `AUTOSAVE_INTERVAL` 环境变量配置间隔秒数）

#### 1.2 AI 能力

| 能力    | 说明                                                     |
|---------|----------------------------------------------------------|
| AI 评分 | 对作文/思维导图/读书笔记评分 (A+~E)，返回评语+改进建议   |
| AI 起名 | 根据提交内容自动生成任务标题（仅限「未命名」开头的任务） |
| AI 出题 | 根据年级和作业类型进行随机出题                           |

- 集成 DeepSeek API，评分依据题目（如有）或内容进行评判
- 评分结果附带评语和改进建议
- 支持 AI 使用记录查询与 Token 用量统计

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

#### 2.5 积分预支

| 功能     | 说明                                             |
|----------|--------------------------------------------------|
| 积分预支 | 在积分不足时可预支积分，支持分期数（1-12期）选择 |
| 自动还款 | 每月 1 号系统自动从本月可用积分中扣除还款金额    |
| 预支追踪 | 查看预支记录、剩余期数、每期还款金额、还款状态   |

- 预支金额必须在 10~9999 积分之间
- 预支倍数为分期数的整数倍（即总还款 = 预支金额 + 预支金额 ÷ 分期数 × 0.1 × 分期数）

#### 2.6 月度结算

- 每月 1 日统计上月加/扣分情况，得到本月可用积分
- 结算公式：`本月可用积分 = 月初始积分 + 上月净积分变化`（月初始积分默认 500，可配置）
- 结算后积分 < 特权最低积分时触发限制规则
- 自动执行积分预支还款扣减

#### 2.7 规则配置

- 所有规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在数据库 `options` 表，按类别分 key 存储（homework、exam、exchange、custom、system）

### 3. 页面功能

#### 3.1 首页看板

- 本月积分统计（加分/扣分/净变化/余额）
- 待完成作业列表
- 积分规则速览（评分标准+兑换比例）
- 积分预支统计看板
- 一键生成分享卡片（html-to-image 截图）

#### 3.2 作业管理

- 作业列表（名称/类型/评语/积分/状态/时间）
- Markdown 编辑器编辑提交内容
- AI 评分（DeepSeek 自动评分 + 积分计算）
- AI 起名（根据内容自动生成任务标题，仅限「未命名」开头的任务）
- AI 出题（根据年级和作业类型进行随机出题）
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
- 支持按作业等级/考试分数/自定义规则快速添加积分记录

#### 3.5 兑换记录

- 所有兑换历史记录，按时间倒序
- 支持兑换看电视、用设备、换现金
- 撤销功能（积分退回）
- 筛选功能

#### 3.6 AI 使用记录

- DeepSeek API 调用记录（使用项目/任务名称/使用时间/Token 用量）
- 按项目汇总统计（AI评分/AI起名/AI出题）
- 总调用次数与总 Token 消耗概览

#### 3.7 规则配置

- 所有规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在数据库 `options` 表，按类别分 key 存储（homework、exam、exchange、custom、system）
- 规则分类展示：作业评分规则、考试分数规则、兑换规则、自定义规则、系统设置

#### 3.8 设置选项

- 系统设置配置（管理员检测、数据库路径等）
- 规则配置页面入口
- 帮助文档链接

### 4. 学迹电台（视频播放）

- 扫描本地视频目录（mp4/avi/mkv/mov 等格式）
- 随机轮播播放 + 续播记忆（resumeTime）
- 收藏管理（收藏/取消收藏）
- 键盘/鼠标控制（方向键快进快退、空格暂停/播放等）
- 流式扫描进度展示
- 视频收藏列表页面

### 5. 学习分享

- 一键生成分享卡片（html-to-image 截图）
- 卡片包含月度积分、作业完成情况等统计数据
- 多张背景图可选（`public/images/`）

## 数据结构设计

### 核心数据模型

```
tasks             -> id, title, type(composition/mindmap), status(pending/completed/expired), createdAt
submissions       -> id, taskId(FK), content, grade(A+/A/B/C/D/E), aiScore, scoredAt, createdAt
point_records     -> id, type(earn/deduct), amount, reason, ruleName, relatedId, relatedType, createdAt
exchanges         -> id, itemType, pointsCost, detail, status(active/revoked), createdAt
options           -> id, key(unique), value
ai_usage_logs     -> id, project, taskTitle, promptTokens, completionTokens, totalTokens, createdAt
point_advances    -> id, amount, installments, repaidAmount, status(active/completed/cancelled), createdAt
month_summary     -> id, month(unique), basePoints(500), totalEarn(0), totalDeduct(0), balance(500), advanceRepayment(0)
videos            -> id, path, title, md5(unique), views(0), resumeTime(0), favorite(0), createdAt
```

### 积分流转全景

```
家长创建作业 ──→ 孩子提交内容(Markdown/思维导图)
                        ↓
              DeepSeek AI 评分 (A+~E)
                        ↓
              自动加/扣积分 → 积分流水记录
                        ↓
              月度汇总 (每月重置基准积分)
                        ↓
          ┌─── 积分兑换 (娱乐时间/现金) ← 兑换比例可配置
          └─── 积分预支 (分期还款) ← 每月1号自动扣款
```

## 项目结构

```
study.webian.dev/
├── apps/                         # 核心源码（React前端 + Express后端）
│   ├── index.tsx                # ★ 前端入口（路由定义）
│   ├── server.ts                # ★ 后端入口（Express 服务器）
│   ├── components/              # 通用 UI 组件
│   │   ├── DataTable.tsx       # 通用数据表格（分页/自定义渲染）
│   │   ├── Layout.tsx          # 主布局（侧边栏+内容区+随机名言）
│   │   ├── Loading.tsx         # 加载状态指示器
│   │   ├── Modal.tsx           # 通用模态框
│   │   ├── RulesPage.tsx       # 规则页面包装器
│   │   ├── Snackbar.tsx        # 全局消息提示（Context Provider）
│   │   └── Tabs.tsx            # 标签页组件
│   ├── db/                     # 数据库层
│   │   ├── index.ts            # 数据库连接（libSQL + Drizzle）
│   │   ├── migrate.ts          # 迁移脚本（初始化表+默认数据）
│   │   └── schema.ts           # Drizzle ORM Schema（8表）
│   ├── lib/                    # 工具库
│   │   ├── api.ts              # 前端 API 客户端（8模块）
│   │   ├── default.ts          # 默认配置（规则/名言/AI提示词）
│   │   ├── types.ts            # TypeScript 类型定义
│   │   ├── utils.ts            # 工具函数（日期格式化/分页/状态映射）
│   │   └── react-md-editor.d.ts # Markdown 编辑器类型声明
│   ├── routes/                 # Express API 路由
│   │   ├── advance-helper.ts   # 积分预支辅助
│   │   ├── ai-usage.ts         # AI使用记录
│   │   ├── exchanges.ts        # 积分兑换
│   │   ├── options.ts          # 系统配置
│   │   ├── points.ts           # 积分流水（含预支/还款/月度结算）
│   │   ├── rules-loader.ts     # 规则加载与初始化
│   │   ├── summary-helper.ts   # 月度汇总计算
│   │   ├── tasks.ts            # 作业管理（含AI评分/起名/出题）
│   │   └── videos.ts           # 视频管理（扫描/流播/收藏/进度）
│   ├── services/               # 业务服务层
│   │   ├── ai.ts               # DeepSeek API封装
│   │   └── points.ts           # 积分计算引擎
│   ├── test/                   # 测试辅助
│   └── __tests__/              # 测试文件
├── pages/                       # 前端页面组件
│   ├── index.css               # 全局样式（Tailwind + 自定义类）
│   ├── share.css               # 分享卡片样式
│   ├── Dashboard.tsx           # 首页看板（统计卡片/待办任务/分享）
│   ├── Tasks.tsx               # 作业管理（创建/编辑/评分）
│   ├── Points.tsx              # 积分记录（筛选/手动添加/月度汇总）
│   ├── Exchanges.tsx           # 兑换记录（创建/撤销/筛选）
│   ├── Borrow.tsx              # 积分预支（申请/还款追踪）
│   ├── Options.tsx             # 设置选项（5标签页，仅管理员）
│   ├── AIUsage.tsx             # AI 使用量统计
│   ├── VideoPlayer.tsx         # 学迹电台（随机轮播/续播/收藏）
│   ├── TVFav.tsx               # 视频收藏列表
│   └── layout/                 # 子组件（共 30+ 个）
│       ├── Share.tsx           # 分享卡片生成（html-to-image）
│       ├── Help.tsx            # 帮助文档
│       ├── TaskEdit.tsx        # 作业编辑器
│       ├── TaskListTable.tsx   # 作业列表表格
│       ├── TaskModal*.tsx      # 作业相关模态框（创建/编辑/评分/结果）
│       ├── PointsListTable.tsx # 积分记录表
│       ├── PointsModalAdd.tsx  # 手动添加积分
│       ├── PointsStatsCards.tsx # 积分统计卡片
│       ├── ExchangesListTable.tsx # 兑换记录表
│       ├── ExchangesModalAdd.tsx # 添加兑换
│       ├── ExchangesStatsCards.tsx # 兑换统计
│       ├── BorrowListTable.tsx # 预支记录表
│       ├── BorrowModalAdd.tsx  # 预支申请
│       ├── BorrowStatsCards.tsx # 预支统计
│       ├── AIListTable.tsx     # AI记录表
│       ├── AISummaryCards.tsx  # AI统计卡片
│       ├── AISummaryTable.tsx  # AI汇总表
│       ├── OptionsRules*.tsx   # 规则配置子组件
│       ├── OptionsSystem.tsx   # 系统设置
│       └── Widget*.tsx         # 首页小部件（8个）
├── data/                        # SQLite 数据库文件
│   └── study.db                # 数据库文件
├── public/                      # 静态资源
│   ├── favicon.svg             # 网站图标
│   ├── fonts/                  # 字体文件
│   │   └── 华康标题宋W9.ttf  # 中文标题字体（3.3MB）
│   ├── images/                 # 分享背景图（5张，~18MB）
│   └── docs/                   # 帮助文档
│       ├── faq.md              # 常见问题
│       ├── markdown.md         # Markdown 语法参考
│       └── mermaid.md          # Mermaid 图表语法参考
├── dist/                        # 构建输出目录
├── .env                         # 环境变量（不提交到仓库）
├── .gitignore                   # Git忽略配置
├── eslint.config.js            # ESLint 配置
├── index.html                   # SPA HTML 入口
├── package.json                 # 项目配置与脚本
├── postcss.config.js           # PostCSS 配置
├── tailwind.config.js          # Tailwind CSS 主题配置
├── tsconfig.json               # TypeScript 严格模式配置
├── vite.config.ts              # Vite 构建配置（代理/编译优化/分包）
└── vitest.config.ts            # Vitest 测试配置
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
- [x] DeepSeek AI 出题功能
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
- [x] 积分预支功能（分期还款 + 自动扣款）
- [x] 规则配置可自定义（月初始积分、特权最低积分、兑换比例）
- [x] 兑换记录正确匹配规则配置的兑换比例

### Phase 4 - 视频播放与分享

- [x] 本地视频扫描与流式播放（Range 请求）
- [x] 随机轮播 + 续播记忆
- [x] 视频收藏与列表管理
- [x] 键盘/鼠标控制
- [x] 学习分享卡片（html-to-image 截图）
- [x] 分享背景图与字体支持

### Phase 5 - 文档与体验优化

- [x] Markdown 语法参考文档（public/docs/markdown.md）
- [x] Mermaid 图表语法参考文档（public/docs/mermaid.md）
- [x] 常见问题文档（public/docs/faq.md）
- [x] React Compiler 编译优化集成
- [x] 单元/组件/集成测试框架搭建
- [x] ESLint + TypeScript 严格模式配置

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
npm run start            # 启动后端（端口3006）
npm run dev              # 启动前端（端口5173）

# 运行测试
npm test                 # 运行所有测试
npm run test:watch       # 监听模式
npm run test:ui          # UI 模式查看测试结果
```

### 环境变量

在项目根目录创建 `.env` 文件：

```env
# DeepSeek API
DEEPSEEK_API_KEY=你的API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 服务端口
PORT=3006

# 数据库路径
DB_PATH=./data/study.db

# 视频分发路径（本地视频文件根目录）
DISTRIBUTION_PATH=E:\\Videos\\xxx

# 自动保存间隔（秒）
AUTOSAVE_INTERVAL=10
```

> ⚠️ `.env` 文件已在 `.gitignore` 中配置，不会被提交到仓库。请勿将 API 密钥硬编码或提交到版本控制。

### 可用脚本

| 脚本                  | 说明                                 |
|-----------------------|--------------------------------------|
| `npm run dev`         | 启动前端开发服务器（端口 5173）      |
| `npm run start`       | 启动后端开发服务器（端口 3006）      |
| `npm run dev:all`     | 同时启动前后端（concurrently）       |
| `npm run build`       | TypeScript 编译检查 + Vite 构建      |
| `npm run preview`     | Vite 预览构建产物                    |
| `npm test`            | 运行所有测试                         |
| `npm run db:migrate`  | 数据库迁移与初始化                   |
| `npm run db:push`     | Drizzle Kit 直接推送 Schema 到数据库 |
| `npm run db:generate` | 生成 Drizzle 迁移文件                |

## 许可证

MIT License
