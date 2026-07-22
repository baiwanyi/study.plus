# 学迹Plus（CloudBase 版）

> 智能学习管理，让成长有迹可循，使每一分都闪闪发光。
> Smart learning management makes growth traceable and every point shine.

## 项目概述

通过积分奖惩机制培养孩子的学习习惯和自律性。**CloudBase 重构版**将原 Express + React 前后端分离架构迁移为腾讯云开发（CloudBase）云函数 + 微信小程序（TDesign）方案，免去自建服务器的运维成本。

**核心功能：**

- **积分奖惩管理**：创建作业，完成作业获得积分，积分可用于兑换奖励或预支
- **作业提交与评分**：编写作文/思维导图/读书笔记，获得 DeepSeek AI 评分
- **积分兑换与预支**：支持兑换娱乐时间、现金等奖励，支持积分预支与分期还款（每月1日自动扣款）
- **AI 智能辅助**：AI 评分、AI 起名、AI 出题、AI 对话、周报分析，全链路智能支持
- **周报管理**：每周学习总结 + SMART 目标规划 + AI 智能分析，支持 Canvas 截图分享
- **费曼学习法**：创建学习心得，AI 评估完整度，评分达标后可进行10题智能测验
- **家庭多用户**：家长-孩子角色体系，一个家长管理多个孩子，数据完全隔离
- **学习分享**：一键生成分享卡片（积分/作业/周报/学习心得），保存到相册

### 产品定位

一款面向 **3-15岁** 孩子的家庭，以积分制为核心，帮助家长管理孩子学习习惯，同时支持孩子在线提交作文/思维导图并获得 AI 评分、积分兑换与预支、每周学习总结与 AI 分析的轻量级工具。运行在微信小程序内，无需额外安装。

## 技术栈

| 类别 | 技术选型 | 说明 |
|------|----------|------|
| 后端运行时 | CloudBase 云函数（Node.js 20） | 无服务器架构，自动扩缩容 |
| 后端语言 | TypeScript 5 + CommonJS | 严格模式，类型安全 |
| 关系数据库 | CloudBase MySQL 8.0 | 全部业务数据（12 张表） |
| 配置数据库 | CloudBase NoSQL（MongoDB 兼容） | 选项配置、评分规则、分类 |
| 用户认证 | JWT（jsonwebtoken）+ 微信登录 | 自动注册 + 家庭绑定 |
| 前端框架 | 微信小程序原生框架 | 与微信生态深度集成 |
| UI 组件库 | TDesign Miniprogram 1.15 | 腾讯官方设计规范 |
| AI 能力 | CloudBase AI（deepseek-v4-flash） | 平台托管，无需第三方 API Key |
| AI 配额 | 单用户每日 200 次调用上限 | 防止恶意刷爆账单 |
| 数据隔离 | 行级 userFilter 自动注入 | 所有查询携带用户/孩子权限 |
| 分享卡片 | Canvas 2D | 原生 Canvas 渲染统计图表 |
| 代码规范 | ESLint 9 + typescript-eslint 8 | 命名规范 + import 排序 |
| 项目管理 | pnpm workspace | 14 个云函数包 + 公共层 |

### 架构设计

采用 **CloudBase 云函数 + 微信小程序** 的小程序云开发架构：

```
[微信小程序] ← wx.cloud.callFunction → [CloudBase 云函数 14 个]
                                            ↓
                                       [MySQL 12表]  [NoSQL: options/rules/categories]
                                            ↓
                                    [定时触发器: 每月1日自动还款]
```

- **云函数**：按业务模块拆分为 14 个独立函数，复用 `common/` 公共层（作为 CloudBase Layer 发布）
- **数据库**：MySQL 存业务数据 + NoSQL 存配置类数据
- **认证**：微信登录 → JWT Token → 每个请求自动注入 `userFilter` 实现数据隔离
- **AI**：统一走 CloudBase AI（`@cloudbase/node-sdk`），不暴露任何第三方 Key
- **定时任务**：每月 1 日 0 点自动执行积分预支还款

### 与 v2.x（Express + React）的区别

| 维度 | v2.x（原版） | v3.0（当前 CloudBase 版） |
|------|-------------|--------------------------|
| 前端 | React 19 SPA（浏览器） | 微信小程序（TDesign） |
| 后端 | Express 5 自托管 | CloudBase 云函数（无服务器） |
| 数据库 | SQLite（本地文件） | CloudBase MySQL + NoSQL |
| 部署 | 需要服务器/域名/备案 | CloudBase 控制台一键部署 |
| 视频播放 | 本地视频扫描 + 流式播放 | **已移除**（小程序限制） |
| RSS 阅读器 | 科普 RSS 源订阅 | **已移除**（非核心功能） |
| 作业编辑器 | @uiw/react-md-editor | 微信原生 `<editor>` 组件 |
| 思维导图 | Mermaid.js 渲染 | WebView 嵌入 SimpleMindMap |
| 分享卡片 | html-to-image DOM 截图 | Canvas 2D 原生绘制 |
| 用户体系 | 单用户 | 家长-孩子多用户+家庭绑定 |

## 功能需求

### 1. 作业提交与评分

#### 1.1 作业类型

| 类型 | 说明 | 编辑器 |
|------|------|--------|
| 作文 | 命题/半命题/材料作文 | 富文本编辑器 |
| 思维导图 | 主题发散，树状结构 | WebView SimpleMindMap |
| 读书笔记 | 结构化笔记 | 富文本编辑器 |

#### 1.2 AI 能力

| 能力 | 说明 |
|------|------|
| AI 评分 | 对作文/思维导图评分 (A+~E)，返回评语+改进建议；读书笔记按【摘抄赏析(50分)+读后感(40分)+好词积累(10分)】专属评分，返回分项得分 |
| AI 起名 | 根据提交内容自动生成作业标题 |
| AI 出题 | 根据年级和作业类型随机出题 |
| 周报分析 | 自动分析周报内容，生成表扬鼓励、困难方案、目标建议与评价 |
| 周报对话 | 针对周报内容与 AI 追问对话 |
| 作业对话 | 在作业编辑器中与 AI 对话，支持生成示范作业与答疑 |
| 学习心得评估 | AI 评估学习心得完整度（评分环 + 遗漏点 + 错误纠正 + 改进建议） |
| 学习心得测验 | 基于心得内容进行10题智能测验（每题即时分析，答完后生成总结报告） |

- 统一使用 CloudBase AI（deepseek-v4-flash 模型），不暴露第三方 API Key
- 每用户每日 AI 调用上限 200 次，防止恶意刷爆账单
- AI 调用记录写入 `ai_usage_logs` 表，可按项目/时间查询使用量

#### 1.3 评分标准（统一作业评分）

| 等级 | 积分变化 | 说明 |
|------|----------|------|
| A+ | +50 分 | 优秀，超出预期 |
| A | +20 分 | 良好，符合要求 |
| B | +10 分 | 合格，基本达标 |
| C | -5 分 | 需改进 |
| D | -10 分 | 不合格，需重做 |
| E | -50 分 | 未完成 |

### 2. 积分奖惩管理

#### 2.1 基础规则

| 规则 | 积分变化 | 说明 |
|------|----------|------|
| 每月初始积分 | 可配置，默认 500 分 | 规则配置页可修改 |
| 特权最低积分 | 可配置，默认 100 分 | 低于此值限制兑换特权 |
| 作业未完成 | -50 分 | 评分等级为 E |

> 月初始积分和特权最低积分均可在「系统配置」页面自定义修改。

#### 2.2 单元测评

| 分数区间 | 积分变化 |
|----------|----------|
| 60 分以下 | -50 分 |
| 60 - 69 分 | -20 分 |
| 70 - 79 分 | -10 分 |
| 80 - 89 分 | +10 分 |
| 90 - 95 分 | +20 分 |
| 95 分以上 | +50 分 |

#### 2.3 额外完成

| 项目 | 条件 | 积分变化 |
|------|------|----------|
| 练习册 | 错题少于 5 题且订正完毕 | +10 分/课 |
| 单元测试卷 | 80 分以上且订正完毕 | +20 分 |

#### 2.4 积分兑换

| 兑换项 | 兑换比例（默认） | 说明 |
|--------|----------------|------|
| 娱乐时间 | 1 积分 = 10 分钟 | 兑换比例可在规则配置修改 |
| 现金兑换 | 10 积分 = 1 元人民币 | 兑换比例可在规则配置修改 |

> 月初积分少于特权最低积分（默认 100 分），则当月手机、平板、电视均无法使用。

#### 2.5 积分预支

| 功能 | 说明 |
|------|------|
| 积分预支 | 在积分不足时可预支积分，支持分期数（1-12期）选择 |
| 自动还款 | 每月 1 号系统自动从本月可用积分中扣除还款金额 |
| 预支追踪 | 查看预支记录、剩余期数、每期还款金额、还款状态 |

- 预支金额必须在 10~9999 积分之间
- 总还款 = 预支金额 + 利息（预支金额 ÷ 分期数 × 0.1 × 分期数）

#### 2.6 月度结算

- 每月 1 日统计上月加/扣分情况，得到本月可用积分
- 结算公式：`本月可用积分 = 月初始积分 + 上月净积分变化`
- 结算后积分 < 特权最低积分时触发限制规则
- 自动执行积分预支还款扣减（定时触发器）

#### 2.7 规则配置

- 所有规则在「系统配置」页面可查看和编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 存储在 NoSQL 集合 `options`，按 key 分类存储（homework、exam、exchange、custom、system）
- 运行时以 NoSQL 配置为准，缺失则 fallback 到代码默认值

### 3. 页面功能

#### 3.1 首页看板

- 本月积分统计 Widget：加分/扣分/净变化/余额概览
- 待完成作业列表
- 快捷导航：作业列表、积分记录、积分兑换
- 孩子切换器（家长视角可切换查看不同孩子数据）

#### 3.2 作业管理

- 作业列表（名称/类型/评分/积分/状态/时间）
- 富文本编辑器提交内容
- AI 评分（DeepSeek 自动评分 + 积分计算）
- AI 起名（根据内容自动生成标题）
- AI 出题（根据年级和作业类型随机出题）
- 思维导图入口（WebView SimpleMindMap）
- 作业创建/编辑/删除
- 支持作文、思维导图、读书笔记三种类型

#### 3.3 积分记录

- 所有加扣分记录列表，按时间倒序
- 筛选功能（类型/时间/规则类别）
- 月度汇总统计
- 支持按作业等级/考试分数/自定义规则快速添加积分记录

#### 3.4 兑换记录

- 所有兑换历史记录，按时间倒序
- 支持兑换娱乐时间、现金
- 撤销功能（积分退回）
- 筛选功能

#### 3.5 AI 使用记录

- AI 调用记录（使用项目/任务名称/使用时间/Token 用量）
- 按项目汇总统计（AI 评分/AI 起名/AI 出题/AI 作业对话/周报分析/周报对话/学习心得评估/学习心得测验）
- 总调用次数与总 Token 消耗概览

#### 3.6 系统配置

- 所有积分规则在页面使用表格展示，支持在线编辑
- 月初始积分、特权最低积分、兑换比例均可自定义修改
- 规则分类展示：作业评分规则、考试分数规则、兑换规则、自定义规则、系统设置

#### 3.7 评语分类管理

- 自定义评语分类（名称/图标/示例）
- 支持添加/编辑/删除
- 存储在 NoSQL 集合 `categories`

#### 3.8 个人中心

- 用户信息展示
- 孩子管理与切换
- 添加/移除孩子（家长专属）
- 评语分类管理入口（家长专属）
- 系统配置入口（家长专属）
- 隐私协议查看
- 数据导出（PIPL 合规）
- 账户删除（级联清理全部数据）
- 退出登录

### 4. 学习周报

- 每周学习总结记录：学到的东西、遇到的问题、薄弱知识点、成就感事项
- SMART 目标规划：支持 S/M/A/R/T 五维度填写
- 改进方法记录
- AI 智能分析：自动分析周报内容，生成表扬鼓励、困难解决方案、目标建议等
- AI 对话追问：针对周报内容与 AI 继续对话
- 周报列表管理：按年份筛选、编辑、删除
- 周报分享：一键生成长图保存到相册

### 5. 学习心得（费曼学习法）

- 学习心得 CRUD（学科/主题/概括/例子/卡壳点/记忆钩子）
- AI 评估完整度（评分环 + 遗漏点 + 错误纠正 + 改进建议 + 总体评价）
- 评分门槛：评估分达 80 分后方可使用智能测验
- AI 智能测验：10 题逐题检验（出题 → 学生回答 → 即时分析对错 → 出下一题），第 10 题答完后生成总结报告（错题回顾 + 掌握程度评分 + 复习建议）
- 学习心得分享卡片

### 6. 学习分享

- 一键生成分享卡片（Canvas 2D 原生渲染）
- 卡片包含月度积分、作业完成情况、周报等统计数据
- 按月选择查看不同月份的统计
- 保存到系统相册

### 7. 家庭多用户

- 家长-孩子角色体系
- 家长注册时自动创建默认孩子
- 一个家长可绑定多个孩子
- 孩子切换器：家长视角可切换查看不同孩子的数据
- 所有业务表含 `user_id` 字段，查询自动注入 `userFilter` 实现数据隔离
- 家长可添加/移除孩子，修改孩子年级

## 数据库设计

### MySQL（业务数据 — 12 张表）

```
users                 用户表（openid/nickname/avatar/role/is_active/privacy_agreed）
family_bindings       家庭绑定（parent_id → child_id/nickname/grade/sort_order）
login_tokens          JWT Token 持久化（user_id/token/expires_at）

tasks                 作业（user_id/title/type/status）
submissions           提交内容（task_id/user_id/content/grade/ai_score/scored_at）
task_conversations    作业对话会话（task_id/user_id）
task_messages         作业对话消息（conversation_id/user_id/role/content）

point_records         积分流水（user_id/type/amount/reason/rule_name/related_id/related_type）
point_advances        积分预支（user_id/amount/total_repayment/installments/status）
exchanges             积分兑换（user_id/item_type/points_cost/detail/status）
month_summary         月度汇总（user_id/month/basePoints/totalEarn/totalDeduct/balance）

weekly_reports        周报（user_id/week_number/year/content/analysis）
weekly_conversations  周报对话会话（weekly_report_id/user_id）
weekly_messages       周报对话消息（conversation_id/user_id/role/content）

studynotes            学习心得（user_id/subject/topic/summary/example/stuckPoints/memoryHook/evaluation）
studynote_conversations 学习心得对话会话（studynote_id/user_id）
studynote_messages    学习心得对话消息（conversation_id/user_id/role/content）

ai_usage_logs         AI 使用记录（user_id/project/task_id/task_title/tokens）
ai_score_logs         AI 评分日志（task_id/submission_id/user_id/content/grade/ai_score/scored_at）
```

> 所有业务表均含 `user_id` 字段，查询时自动注入 `(user_id = ? OR user_id IN (子孩子列表))` 实现数据隔离。

### NoSQL（配置类数据 — 3 个集合）

| 集合名 | 用途 | 文档结构 |
|--------|------|----------|
| `options` | 系统配置和积分规则 | `{ key, value }` |
| `rules` | 积分规则运行时缓存（fallback 到默认值） | `{ homework, exam, exchange, custom, system }` |
| `categories` | 评语分类 | `{ name, icon, sample }` |

### 积分流转全景

```
家长创建作业 ──→ 孩子提交内容
                    ↓
          DeepSeek AI 评分 (A+~E)
                    ↓
          自动加/扣积分 → 积分流水记录
                    ↓
          月度汇总 (每月重置基准积分)
                    ↓
      ┌─── 积分兑换 (娱乐时间/现金) ← 兑换比例可配置
      └─── 积分预支 (分期还款) ← 每月1号定时触发器自动扣款
```

## 项目结构

```
study.cloudbase/
├── cloudfunctions/              # 云函数（14 个）
│   ├── common/                  # ★ 公共层（作为 Layer 发布）
│   │   ├── db.ts               # MySQL 连接池 + 参数化查询
│   │   ├── auth.ts             # JWT 签发/验证
│   │   ├── db-query.ts         # userFilter 自动注入 + 权限校验
│   │   ├── entry.ts            # 云函数统一入口包装（try/catch + 响应格式化）
│   │   ├── errors.ts           # 统一错误类 + 响应格式
│   │   ├── config.ts           # 环境变量读取 + fail-fast 校验
│   │   ├── constants.ts        # 默认配置（规则/分页/枚举）
│   │   ├── types.ts            # 领域类型定义
│   │   ├── nosql.ts            # NoSQL 集合映射
│   │   ├── rules.ts            # 积分规则加载 + 计算函数
│   │   ├── summary-helper.ts   # 月度汇总计算
│   │   ├── advance-helper.ts   # 积分预支偿还逻辑
│   │   ├── share-stats.ts      # 分享统计聚合
│   │   ├── children.ts         # 孩子列表查询
│   │   ├── categories-store.ts # 评语分类 NoSQL CRUD
│   │   ├── weekly-content.ts   # 周报内容序列化
│   │   ├── ai/                 # AI 模块
│   │   │   ├── client.ts       # CloudBase AI 调用封装
│   │   │   ├── prompts.ts      # 提示词模板
│   │   │   ├── task.ts         # 作业 AI（评分/起名/出题/对话/示范）
│   │   │   ├── weekly.ts       # 周报 AI（分析/对话）
│   │   │   └── studynotes.ts   # 学习心得 AI（评估/测验）
│   │   └── package.json        # Common Layer 依赖清单
│   ├── auth/                   # 微信登录 + 自动注册
│   ├── family/                 # 家庭绑定管理
│   ├── tasks/                  # 作业 CRUD + AI 评分/起名/出题/对话
│   ├── points/                 # 积分流水 CRUD + 月度统计
│   ├── exchanges/              # 积分兑换
│   ├── advances/               # 积分预支 [+ 每月1日定时触发器]
│   ├── weekly/                 # 周报 CRUD + AI 分析/对话
│   ├── studynotes/             # 学习心得 CRUD + AI 评估/测验
│   ├── options/                # 系统配置 CRUD
│   ├── categories/             # 评语分类 CRUD
│   ├── ai-usage/               # AI 使用记录查询
│   ├── share-stats/            # 分享统计查询
│   ├── init/                   # 首次初始化（NoSQL 默认数据）
│   └── privacy/                # PIPL 数据导出/账户删除
├── database/
│   └── schema.sql              # MySQL DDL（全部 12 张表）
├── miniprogram/                # ★ 微信小程序（TDesign）
│   ├── app.json                # 应用配置（14 页注册 + 4 TabBar）
│   ├── app.ts                  # 应用入口（wx.cloud.init + 全局数据）
│   ├── utils/
│   │   ├── auth.ts             # 登录态/Token/用户/孩子存储
│   │   ├── api.ts              # wx.cloud.callFunction 统一封装
│   │   └── constants.ts        # 枚举标签映射
│   ├── pages/                  # 14 个页面
│   │   ├── login/              # 微信登录
│   │   ├── dashboard/          # 首页看板
│   │   ├── tasks/              # 作业列表
│   │   ├── mindmap/            # 思维导图（WebView SimpleMindMap）
│   │   ├── weekly/             # 周报
│   │   ├── studynotes/         # 学习心得
│   │   ├── points/             # 积分记录
│   │   ├── exchanges/          # 兑换记录
│   │   ├── borrow/             # 积分预支
│   │   ├── ai-usage/           # AI 用量查询
│   │   ├── share/              # 分享（Canvas 2D）
│   │   ├── options/            # 系统配置（家长专属）
│   │   ├── categories/         # 评语分类管理（家长专属）
│   │   └── my/                 # 个人中心
│   └── components/             # 5 个组件
│       ├── child-selector/     # 孩子切换器
│       ├── ai-chat-panel/      # AI 对话面板
│       ├── evaluation-report/  # 学习心得评估报告
│       ├── share-card/         # 分享卡片（Canvas 渲染）
│       └── grade-badge/        # 等级徽章
├── eslint.config.mjs           # ESLint 9 flat config
├── tsconfig.json                # TypeScript 严格模式配置
├── package.json                 # 根编排脚本
├── .env.example                 # 环境变量模板
└── README.md
```

## 安全设计

### 数据隔离

- 所有业务表含 `user_id` 字段，`db-query.ts` 的 `userFilter` 自动注入 SQL WHERE 条件
- 家长查询时自动切换为选中孩子的 `user_id`，确保只能查看自己孩子的数据
- 周报/学习心得/积分等所有查询均受 `userFilter` 保护

### AI 安全

- AI 调用走 CloudBase AI（`@cloudbase/node-sdk`），不暴露任何第三方 API Key
- 每用户每日 200 次调用上限（`DAILY_AI_CALL_CAP`），超限返回 429
- 调用用量写入 `ai_usage_logs` 表，开启后可按需设置预警

### 认证安全

- 微信登录获得 openid，JWT 有效期 30 天
- `assertJwtSecret()` fail-fast：环境变量缺失时立即拒绝启动
- 隐私协议版本号强校验，拒绝旧版本协议

### PIPL 合规

- `privacy` 云函数实现数据导出（仅返回脱敏字段）与账户删除
- 删除时级联清理家长及其绑定的所有孩子数据（依赖外键 CASCADE）
- 隐私协议在首次登录时获取同意

### API 响应安全

- 云函数统一入口 `entry.ts` 捕获所有异常，不向客户端暴露堆栈
- 错误响应格式：`{ code, error: true, message }`，不包含 `details` 中的敏感信息
- 数据库报错仅在服务端日志记录

## 部署指南

### 前提条件

- 腾讯云 CloudBase 环境已开通（含 MySQL 和 AI 模型能力）
- 微信小程序 AppId 已注册并关联 CloudBase
- Node.js 20+ 本地开发环境

### 步骤

1. **创建 CloudBase 环境**（如已有则跳过）

   ```bash
   # 使用 CloudBase CLI 或控制台创建环境
   # 开通 MySQL 数据库
   # 启用 AI 模型（DeepSeek）
   ```

2. **建表**

   在 CloudBase MySQL 中执行 `database/schema.sql` 创建全部 12 张业务表。

3. **发布公共层**

   将 `cloudfunctions/common` 发布为 CloudBase **Layer**（如命名 `study-common`）。

   ```bash
   # 在 CloudBase 控制台或通过 CLI
   # 创建 Layer，上传 common/ 目录，指定版本号
   ```

4. **上传云函数**

   逐个将 `cloudfunctions/` 下的 14 个函数上传到 CloudBase：
   - 每个函数 `package.json` 中已声明依赖
   - 函数运行时引用上一步发布的 Common Layer
   - `advances` 函数已预配定时触发器配置（每月1日 0 点自动还款）

5. **配置环境变量**

   在每个云函数或公共层中设置以下环境变量：

   | 变量 | 说明 |
   |------|------|
   | `ENV_ID` | CloudBase 环境 ID |
   | `JWT_SECRET` | JWT 签发密钥（务必使用强随机值） |
   | `MYSQL_HOST` | MySQL 主机地址 |
   | `MYSQL_PORT` | MySQL 端口（默认 3306） |
   | `MYSQL_USER` | MySQL 用户名 |
   | `MYSQL_PASSWORD` | MySQL 密码 |
   | `MYSQL_DATABASE` | 数据库名 |

6. **审核微信小程序**

   在微信开发者工具中打开 `miniprogram/` 目录：
   - 填入 AppId
   - 配置 `miniprogram/utils/config.ts` 中的 `ENV_ID`
   - 预览/真机调试/上传审核

7. **首次初始化**

   调用 `init` 云函数（可在小程序首次启动或管理后台触发）：
   - 写入默认积分规则到 NoSQL `rules` 集合
   - 写入默认系统设置到 NoSQL `options` 集合
   - 写入默认评语分类到 NoSQL `categories` 集合

### 定时触发器

`advances` 函数已配置每月 1 日 0 点定时触发器：

```json
{
  "name": "monthlyAdvanceRepay",
  "type": "timer",
  "config": "0 0 0 1 * *"
}
```

功能：自动扣除本月应还的预支分期金额，更新 `month_summary` 中的积分余额。

## 本地开发

```bash
# 安装依赖
cd cloudfunctions/common && pnpm install
cd ../../ && pnpm install

# 运行 ESLint 检查
pnpm lint                     # 全量检查（云函数 + 小程序）
pnpm lint:cf                  # 仅云函数
pnpm lint:mp                  # 仅小程序

# TypeScript 类型检查
npx tsc -p tsconfig.json --noEmit

# 云函数本地调试（使用 CloudBase CLI）
tcb func run auth
```

### ESLint

项目使用 ESLint 9 flat config（`eslint.config.mjs`），规则包括：
- **TypeScript 命名规范**：camelCase 变量/函数、PascalCase 类型/接口、UPPER_CASE 枚举成员/全局常量
- **import 排序**：builtin → external → internal → sibling → index → type，组内字母序
- **参数/属性兼容**：允许 snake_case（DB 列映射）和 leadingUnderscore（NoSQL `_id`）

```bash
pnpm lint                     # 检查所有 .ts 文件
pnpm lint --fix               # 自动修复 import 排序等可修复问题
```

## 可用脚本

| 脚本 | 说明 |
|------|------|
| `pnpm lint` | 全量 ESLint 检查（云函数 + 小程序） |
| `pnpm lint:cf` | 仅检查云函数代码 |
| `pnpm lint:mp` | 仅检查小程序代码 |
| `pnpm deploy:common` | 将 common/ 发布为 CloudBase Layer 的提示 |

## 开发计划

### Phase 1 - 基础框架

- [x] CloudBase 环境开通 + MySQL 建表
- [x] 公共层架构设计（db/auth/db-query/entry/errors）
- [x] 微信登录 + JWT 认证
- [x] 家庭多用户体系（家长-孩子绑定）
- [x] 小程序 TabBar 导航（4 Tab）

### Phase 2 - 核心功能

- [x] 作业创建与管理
- [x] 作业提交与 AI 评分
- [x] DeepSeek AI 评分/起名/出题集成
- [x] 思维导图 WebView（SimpleMindMap）
- [x] 积分流水记录

### Phase 3 - 积分系统

- [x] 积分自动计算（统一作业评分标准，含 A+ 等级 +50 分）
- [x] 月度结算逻辑
- [x] 积分兑换（娱乐时间/现金）
- [x] 积分预支（分期还款 + 每月 1 日自动扣款）
- [x] 规则配置可自定义（NoSQL 存储）
- [x] 可配置的积分规则（作业/考试/兑换/自定义规则）

### Phase 4 - 周报与费曼学习法

- [x] 周报 CRUD + AI 分析/对话
- [x] 学习心得 CRUD + AI 评估
- [x] AI 智能测验（10 题逐题检验 + 总结报告）
- [x] 评估报告组件

### Phase 5 - 分享与配置

- [x] Canvas 2D 分享卡片
- [x] 系统配置页面（家长专属）
- [x] 评语分类管理（家长专属）
- [x] AI 使用记录查询
- [x] 隐私协议与 PIPL 合规

### Phase 6 - 安全与质量

- [x] userFilter 数据隔离注入
- [x] AI 每日配额限制（200次/用户）
- [x] API 响应不暴露堆栈
- [x] ESLint 9 + typescript-eslint 8 规范
- [x] 命名规范 + import 排序
- [x] DB 列映射 snake_case 兼容

## 许可证

MIT License
