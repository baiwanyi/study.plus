# 学迹Plus

> 智能学习管理，让成长有迹可循，使每一分都闪闪发光。
> Smart learning management makes growth traceable and every point shine.

## 项目概述

### 项目背景

通过积分奖惩机制培养孩子的学习习惯和自律性，打造一个集习惯管理、积分激励、作业提交与评分、积分预支与分享于一体的智能学习管理工具。

**核心功能：**

- **积分奖惩管理**：创建作业，完成作业获得积分，积分可用于兑换奖励或预支
- **作业提交与评分**：编写作文/思维导图/读书笔记，获得 DeepSeek AI 评分
- **积分兑换与预支**：支持兑娱乐时间、现金等奖励，支持积分预支与分期还款
- **AI 智能辅助**：AI 评分、AI 起名、AI 出题，全链路智能支持
- **周报管理**：每周学习总结 + SMART 目标规划 + AI 智能分析，支持截图分享
- **费曼学习法**：创建学习心得（概括/举例/卡壳/记忆钩子），AI 评估完整度 + 追问对话，支持分享
- **学习分享**：一键生成分享卡片（积分/作业/周报/学习心得），记录成长瞬间
- **本地视频播放**：扫描本地目录，随机轮播视频，支持续播、收藏、键盘/鼠标控制
- **科普 RSS 阅读器**：订阅环球科学 RSS 源，分类浏览科普文章

### 产品定位

一款面向 **3-15岁** 孩子的家庭，以积分制为核心，帮助家长管理孩子学习习惯，同时支持孩子在线提交作文/思维导图并获得 AI 评分、积分兑换与预支、每周学习总结与 AI 分析、RSS 科普阅读的轻量级工具。

## 技术栈

| 类别     | 技术选型                                  | 说明                                 |
| -------- | ----------------------------------------- | ------------------------------------ |
| 前端框架 | React 19 + React Router 7 + TypeScript 6  | SPA 单页应用                         |
| CSS      | Tailwind CSS 4                            | 原子化 CSS，自定义色板               |
| 图标库   | Lucide React                              | 轻量级 SVG 图标库                    |
| Markdown | @uiw/react-md-editor (4.x)                | Markdown 编辑器 + 实时预览           |
| 思维导图 | Mermaid.js 11.15                          | Markdown 语法渲染思维导图            |
| 编译优化 | React Compiler (Babel 插件)               | 自动记忆化编译优化                   |
| 后端服务 | Express 5 + tsx                           | RESTful API (端口 3001)              |
| 数据库   | SQLite + @libsql/client                   | 轻量级本地数据库                     |
| ORM      | Drizzle ORM + Drizzle Kit                 | 类型安全的 SQL 查询构建器 + 迁移工具 |
| AI 能力  | DeepSeek API (deepseek-v4-flash)          | 评分/起名/出题/周报分析/智能对话     |
| 测试     | Vitest 4 + @testing-library/react + jsdom | 单元测试 + 组件测试 + API 集成测试   |
| 视频播放 | HTML5 `<video>` + react-player            | 原生视频播放器，支持 Range 请求      |
| 图片导出 | html-to-image                             | DOM 节点截图生成分享卡片             |
| 项目管理 | pnpm workspace monorepo                   | 3 包隔离：前端/后端/共享层           |

### 项目架构

采用 **前后端分离** 的 pnpm workspace monorepo 架构，拆分为 3 个独立包：

- **`apps/`（前端）**：React 19 + Vite 8，运行在端口 5173
- **`server/`（后端）**：Express 5 + tsx，运行在端口 3001
- **`shared/`（共享层）**：类型定义、常量、Zod Schema、纯工具函数

**依赖关系**：`apps → shared`、`server → shared`，前端和后端之间无直接依赖。

- **数据库**：SQLite 本地数据库 (`data/study.db`)，使用 Drizzle ORM 进行数据操作
- **开发模式**：通过 Vite 代理配置将 `/api` 请求转发到 Express 后端
- **生产部署**：Vite 构建前端到 `dist/`，Express 在生产模式下 serve 静态文件

## 功能需求

### 1. 作业提交与评分

#### 1.1 编辑器

- 使用 `@uiw/react-md-editor` Markdown 编辑器，支持实时预览
- 支持思维导图编辑（基于 Mermaid 语法渲染）
- 自动保存功能（可通过 `AUTOSAVE_INTERVAL` 环境变量配置间隔秒数）
- 读书笔记专用的结构化编辑器：书籍信息（书名/篇目/作者）、摘抄赏析、好词积累、读后感
- 保存时自动更新标题为 `{作者}：《{书名}》{篇目}读后感`
- 自动保存成功后标题即时更新在编辑器头部
- 读书笔记编辑器中显示 AI 改进建议区域

#### 1.2 AI 能力

| 能力     | 说明                                                     |
| -------- | -------------------------------------------------------- |
| AI 评分  | 对作文/思维导图/读书笔记评分 (A+~E)，返回评语+改进建议   |
| AI 起名  | 根据提交内容自动生成任务标题（仅限「未命名」开头的任务） |
| AI 出题  | 根据年级和作业类型进行随机出题                           |
| 周报分析 | 自动分析周报内容，生成表扬鼓励、困难方案、目标建议与评价 |
| 周报对话 | 针对周报内容与 AI 进行追问对话                           |
| 作业对话 | 在作业编辑器中与 AI 对话，支持生成示范作业与答疑         |

- 集成 DeepSeek API（deepseek-v4-flash 模型），评分依据题目（如有）或内容进行评判
- 评分结果附带评语和改进建议
- 支持 AI 使用记录查询与 Token 用量统计（按 AI评分/AI起名/AI出题/**AI作业对话**/周报分析/周报对话 分类）

#### 1.3 评分标准（统一作业评分）

| 等级 | 积分变化 | 说明           |
| ---- | -------- | -------------- |
| A+   | +50 分   | 优秀，超出预期 |
| A    | +20 分   | 良好，符合要求 |
| B    | +10 分   | 合格，基本达标 |
| C    | -5 分    | 需改进         |
| D    | -10 分   | 不合格，需重做 |
| E    | -50 分   | 未完成         |

### 2. 积分奖惩管理

#### 2.1 基础规则

| 规则         | 积分变化            | 说明                 |
| ------------ | ------------------- | -------------------- |
| 每月初始积分 | 可配置，默认 500 分 | 规则配置页可修改     |
| 特权最低积分 | 可配置，默认 100 分 | 低于此值限制兑换特权 |
| 作业未完成   | -50 分              | 评分等级为 E         |

> 💡 月初始积分和特权最低积分均可在「规则配置」页面自定义修改。

#### 2.2 单元测评

| 分数区间   | 积分变化 |
| ---------- | -------- |
| 60 分以下  | -50 分   |
| 60 - 69 分 | -20 分   |
| 70 - 79 分 | -10 分   |
| 80 - 89 分 | +10 分   |
| 90 - 95 分 | +20 分   |
| 95 分以上  | +50 分   |

#### 2.3 额外完成

| 项目       | 条件                    | 积分变化  |
| ---------- | ----------------------- | --------- |
| 练习册     | 错题少于 5 题且订正完毕 | +10 分/课 |
| 单元测试卷 | 80 分以上且订正完毕     | +20 分    |

#### 2.4 积分兑换

| 兑换项   | 兑换比例（默认）     | 说明                     |
| -------- | -------------------- | ------------------------ |
| 娱乐时间 | 1 积分 = 10 分钟     | 兑换比例可在规则配置修改 |
| 现金兑换 | 10 积分 = 1 元人民币 | 兑换比例可在规则配置修改 |

> ⚠️ 月初积分少于特权最低积分（默认 100 分），则当月手机、平板、电视均无法使用。

#### 2.5 积分预支

| 功能     | 说明                                             |
| -------- | ------------------------------------------------ |
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

- 本月积分统计 Widget：加分/扣分/净变化/余额（WidgetStats + WidgetBalance）
- 待完成作业列表（WidgetPendingTasks）
- 积分规则速览 Widget：评分标准、兑换规则、考试规则、自定义规则（4 个规则 Widget）
- 积分预支统计看板（WidgetAdvanceStats）
- 一键生成分享卡片（html-to-image 截图）
- 侧边栏：导航菜单（Lucide React 图标）+ 随机学习名言展示（从经典名言中随机显示）

#### 3.2 作业管理

- 作业列表（名称/类型/评语/积分/状态/时间）
- Markdown 编辑器编辑提交内容
- AI 评分（DeepSeek 自动评分 + 积分计算）
- AI 起名（根据内容自动生成任务标题，仅限「未命名」开头的任务）
- AI 出题（根据年级和作业类型进行随机出题）
- 作业创建/编辑/删除
- 作业名称支持作文、思维导图、读书笔记三种类型，为空时自动命名（如「未命名作文作业」）

#### 3.3 积分记录

- 所有加扣分记录列表，按时间倒序
- 筛选功能（类型/时间/规则类别）
- 月度汇总统计
- 添加记录时备注支持快捷选项（可自定义，每行一个，保存到本地）
- 支持按作业等级/考试分数/自定义规则快速添加积分记录

#### 3.4 兑换记录

- 所有兑换历史记录，按时间倒序
- 支持兑换看电视、用设备、换现金
- 撤销功能（积分退回）
- 筛选功能

#### 3.5 AI 使用记录

- DeepSeek API 调用记录（使用项目/任务名称/使用时间/Token 用量）
- 按项目汇总统计（AI评分/AI起名/AI出题/AI作业对话/周报分析/周报对话）
- 总调用次数与总 Token 消耗概览

#### 3.6 规则配置

- 所有规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在数据库 `options` 表，按类别分 key 存储（homework、exam、exchange、custom、system）
- 规则分类展示：作业评分规则、考试分数规则、兑换规则、自定义规则、系统设置

#### 3.7 设置选项

- 系统设置配置（管理员检测、数据库路径、自动保存间隔等）
- 规则配置页面：作业评分规则、考试分数规则、兑换规则、自定义规则 4 个标签页
- 评语管理：自定义作业/考试/自定义积分的快捷评语
- 名言管理：自定义侧边栏名言列表
- 帮助文档链接（Markdown 语法 / Mermaid 图表语法 / 常见问题）

### 4. 学迹电台（视频播放）

- 扫描本地视频目录（mp4/avi/mkv/mov 等格式）
- 随机轮播播放 + 续播记忆（resumeTime）
- 收藏管理（收藏/取消收藏）
- 键盘/鼠标控制（方向键快进快退、空格暂停/播放等）
- 流式扫描进度展示
- 视频收藏列表页面

### 5. 学习周报

- 每周学习总结记录：学到的东西、遇到的问题、薄弱知识点、成就感事项
- SMART 目标规划：支持 S/M/A/R/T 五维度填写
- 改进方法记录
- AI 智能分析：自动分析周报内容，生成表扬鼓励、困难解决方案、目标建议等
- AI 对话追问：针对周报内容与 AI 继续对话
- 周报列表管理：按年份筛选、编辑、删除
- 周报截图分享：一键生成长图保存

### 6. 学习分享

- 一键生成分享卡片（html-to-image 截图）
- 卡片包含月度积分、作业完成情况、周报等统计数据
- 多张背景图可选（`public/images/`）
- 分享时读书笔记内容自动解析：书籍信息、好词、摘抄赏析、读后感按结构化 Markdown 排版
- 摘抄赏析每套独立展示，`**摘抄：**` 和 `**赏析：**` 分行加粗标记，各条目间用横线分割

## 数据结构设计

### 核心数据模型

```
tasks               -> id, title, type(composition/mindmap/notes/math/english), status(pending/completed/expired), createdAt
submissions         -> id, taskId(FK), content, grade(A+/A/B/C/D/E), aiScore, scoredAt, createdAt
point_records       -> id, type(earn/deduct), amount, reason, ruleName, relatedId, relatedType, createdAt
exchanges           -> id, itemType, pointsCost, detail, status(active/revoked), createdAt
options             -> id, key(unique), value
ai_usage_logs       -> id, project, taskTitle, promptTokens, completionTokens, totalTokens, createdAt
point_advances      -> id, amount, installments, repaidAmount, status(active/completed/cancelled), createdAt
month_summary       -> id, month(unique), basePoints(500), totalEarn(0), totalDeduct(0), balance(500), advanceRepayment(0)
videos              -> id, path, title, md5(unique), views(0), resumeTime(0), favorite(0), createdAt
weekly_reports      -> id, weekNumber, year, content(JSON), analysis(JSON), createdAt, updatedAt
weekly_conversations-> id, reportId(FK), role(ai/student), createdAt
weekly_messages     -> id, conversationId(FK), role, content, createdAt
task_conversations  -> id, taskId(FK, CASCADE), createdAt, updatedAt
task_messages       -> id, conversationId(FK, CASCADE), role(user/assistant), content, createdAt
studynotes            -> id, subject(math/chinese/english), topic, summary, example, stuckPoints, memoryHook?, evaluation?, evaluatedAt?, createdAt, updatedAt
studynote_conversations-> id, studynoteId(FK, CASCADE), createdAt, updatedAt
studynote_messages     -> id, conversationId(FK, CASCADE), role(user/assistant), content, createdAt
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
├── apps/                         # ★ 前端 (React + Vite)
│   ├── public/                   # 静态资源（图标/字体/图片/帮助文档）
│   ├── src/
│   │   ├── main.tsx             # 前端入口（路由定义 + 渲染挂载）
│   │   ├── api/                 # HTTP 客户端（14 个 API 模块）
│   │   ├── utils/               # 前端专用工具（isAdmin/loadConfig/CSS 颜色映射）
│   │   ├── components/          # 通用 UI 组件
│   │   │   ├── Layout.tsx      # 主布局（侧边栏 + 内容区 + 随机名言）
│   │   │   ├── Snackbar.tsx    # 全局消息提示（Context Provider）
│   │   │   ├── Modal.tsx       # 通用模态框
│   │   │   ├── DataTable.tsx   # 通用数据表格
│   │   │   ├── Tabs.tsx        # 标签页组件
│   │   │   ├── RulesPage.tsx   # 规则页面包装器
│   │   │   ├── Loading.tsx     # 加载指示器
│   │   │   └── AiChatPanel.tsx # AI 聊天面板
│   │   ├── pages/               # 页面组件（12 个页面 + 38 个页面子组件）
│   │   │   ├── Dashboard.tsx   # 首页看板
│   │   │   ├── Tasks.tsx       # 作业管理
│   │   │   ├── Points.tsx      # 积分记录
│   │   │   ├── Exchanges.tsx   # 兑换记录
│   │   │   ├── Borrow.tsx      # 积分预支
│   │   │   ├── Options.tsx     # 设置选项（管理员）
│   │   │   ├── AIUsage.tsx     # AI 使用量统计
│   │   │   ├── Weekly.tsx      # 学习周报
│   │   │   ├── VideoPlayer.tsx # 学迹电台
│   │   │   ├── TVFav.tsx       # 视频收藏
│   │   │   ├── RssReader.tsx   # RSS 阅读器
│   │   │   ├── Studynotes/     # 学习心得模块
│   │   │   │   ├── index.tsx               # 学习心得列表页
│   │   │   │   ├── StudynotesModalEditor.tsx  # 学习心得编辑模态框
│   │   │   │   ├── StudynotesModalShare.tsx   # 学习心得分享卡片
│   │   │   │   ├── StudynotesListTable.tsx    # 学习心得表格视图
│   │   │   │   ├── StudynotesSubjectFilter.tsx # 学科筛选组件
│   │   │   │   ├── EvaluationReport.tsx       # AI 评估报告组件
│   │   │   │   └── hooks/                   # 自定义 Hooks
│   │   │   └── layout/         # 页面子组件（37 个）
│   │   └── styles/              # 全局样式
│   │       ├── index.css        # Tailwind 4 + 自定义色板
│   │       ├── markdown-editor.css
│   │       └── markdown-viewer.css
│   ├── index.html               # SPA HTML 入口
│   ├── vite.config.ts           # Vite 构建配置（代理/编译优化/分包）
│   ├── tsconfig.json
│   ├── postcss.config.js
│   └── eslint.config.js
├── server/                       # ★ 后端 (Express + SQLite)
│   ├── src/
│   │   ├── index.ts             # Express 入口（路由注册 + 静态文件服务）
│   │   ├── db/                  # 数据库层
│   │   │   ├── index.ts        # 数据库连接（libSQL + Drizzle）
│   │   │   ├── schema.ts       # Drizzle ORM Schema（13 表）
│   │   │   └── migrate.ts      # 迁移脚本（初始化表 + 默认数据）
│   │   ├── routes/             # API 路由（12 个模块）
│   │   │   ├── tasks.ts        # 作业管理（含 AI 评分/起名/出题/对话）
│   │   │   ├── points.ts       # 积分流水（含预支/还款/月度结算）
│   │   │   ├── exchanges.ts    # 积分兑换
│   │   │   ├── options.ts      # 系统配置
│   │   │   ├── ai-usage.ts     # AI 使用记录
│   │   │   ├── videos.ts       # 视频管理（扫描/流播/收藏）
│   │   │   ├── weekly.ts       # 周报管理（CRUD + AI 分析 + 对话）
│   │   │   ├── feynman.ts      # 费曼学习法（CRUD + AI 评估 + 追问对话）
│   │   │   ├── rss.ts          # 科普 RSS 阅读器
│   │   │   ├── rules-loader.ts # 规则加载与初始化
│   │   │   ├── summary-helper.ts # 月度汇总计算
│   │   │   └── advance-helper.ts # 积分预支辅助
│   │   └── services/           # 业务服务层
│   │       ├── ai.ts           # DeepSeek API 封装
│   │       └── points.ts       # 积分计算引擎
│   ├── package.json
│   └── tsconfig.json
├── shared/                       # ★ 共享层（类型/常量/工具函数）
│   ├── src/
│   │   ├── types.ts             # 所有 TypeScript 类型定义
│   │   ├── constants.ts         # 默认配置（规则/名言/AI 提示词）
│   │   ├── weekly.ts            # 周报 Zod Schema + 序列化工具
│   │   ├── utils.ts             # 纯工具函数（格式化/状态映射/分页）
│   │   └── index.ts             # 统一导出
│   ├── package.json
│   └── tsconfig.json
├── __tests__/                    # 统一测试目录（前后端共用）
├── data/                         # SQLite 数据库文件
│   └── study.db
├── dist/                         # 构建输出目录
├── .env                          # 环境变量（不提交到仓库）
├── .gitignore                    # Git 忽略配置
├── package.json                  # 根 workspace 编排脚本
├── pnpm-workspace.yaml           # Workspace 配置
├── tsconfig.json                 # 根 tsconfig（仅供 IDE 引用）
└── README.md

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

### Phase 6 - 周报系统与扩展

- [x] 周报创建与管理（CRUD）
- [x] 周报内容结构（学习总结 + SMART 目标 + 改进方法）
- [x] AI 周报分析（表扬鼓励/困难方案/建议/评价）
- [x] AI 周报对话追问
- [x] 周报截图分享（html-to-image）
- [x] Markdown 查看器排版美化
- [x] 科普 RSS 阅读器

### Phase 7 - 作业 AI 对话

- [x] 可复用 AI 聊天面板组件（AiChatPanel）
- [x] 生成示范作业（DeepSeek 根据作业题目生成示例）
- [x] 作业答疑对话（基于作业内容进行 AI 辅导）
- [x] 对话持久化（task_conversations + task_messages 表）
- [x] 作业删除时级联清理对话记录
- [x] AI 使用统计区分「AI作业对话」项目

### Phase 8 - 费曼学习法

- [x] 学习心得 CRUD（subject/topic/summary/example/stuckPoints/memoryHook）
- [x] AI 评估完整度（评分环 + 遗漏点 + 错误纠正 + 改进建议 + 总体评价）
- [x] AI 追问对话（支持历史消息 + 自动追问无卡壳心得）
- [x] 学习心得分享卡片（html-to-image 截图导出）
- [x] 可复用评估报告组件（EvaluationReport）

## 本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 如果没有 .env.example，请参考下方「环境变量」手动创建 .env

# 初始化数据库
pnpm db:migrate

# 同时启动前后端开发服务器
pnpm dev

# 或分别启动
pnpm dev:server          # 仅启动后端（端口3001）
pnpm dev:apps            # 仅启动前端（端口5173）

# 构建前端
pnpm build

# 启动生产模式
pnpm start               # Express 启动，serve 前端构建产物 + API

# 运行测试
pnpm test                # 运行所有测试
```

### 环境变量（根目录 .env）

```env
# DeepSeek API
DEEPSEEK_API_KEY=你的API密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com

# 服务端口
PORT=3001

# 数据库路径
DB_PATH=./data/study.db

# 视频分发路径（本地视频文件根目录）
DISTRIBUTION_PATH=E:\\Videos\\xxx

# 自动保存间隔（秒）
AUTOSAVE_INTERVAL=10
```

> ⚠️ `.env` 文件已在 `.gitignore` 中配置，不会被提交到仓库。请勿将 API 密钥硬编码或提交到版本控制。

### 可用脚本

| 脚本               | 说明                                       |
| ------------------ | ------------------------------------------ |
| `pnpm dev`         | 同时启动前后端开发服务器（concurrently）   |
| `pnpm dev:apps`    | 启动前端开发服务器（Vite，端口 5173）      |
| `pnpm dev:server`  | 启动后端开发服务器（tsx watch，端口 3001） |
| `pnpm build`       | 构建前端到 `dist/`                         |
| `pnpm start`       | 启动生产模式 Express 服务器                |
| `pnpm test`        | 运行所有测试                               |
| `pnpm db:migrate`  | 数据库迁移与初始化                         |
| `pnpm db:push`     | Drizzle Kit 直接推送 Schema 到数据库       |
| `pnpm db:generate` | 生成 Drizzle 迁移文件                      |

## 许可证

MIT License
