# 学迹Plus（CloudBase 重构版）

「学迹Plus」家庭学习积分管理工具的后端（CloudBase 云函数）+ 微信小程序（TDesign）前端。

## 架构

- **后端**：CloudBase 云函数（Node.js），按业务模块拆分为多个函数，复用 `cloudfunctions/common` 公共层（作为 CloudBase Layer 发布）。
- **数据库**：CloudBase MySQL（业务数据，所有表含 `user_id` 实现家庭数据隔离）+ CloudBase NoSQL（options 配置类）。
- **AI**：统一走 CloudBase AI（`app.ai().createModel('deepseek')`），不暴露任何第三方 Key。
- **前端**：微信小程序原生框架 + `tdesign-miniprogram` 1.15。

## 目录

```
cloudfunctions/        # 云函数（每个子目录一个函数 + 自己的 package.json）
  common/              # 公共层（作为 Layer 发布）：db / auth / db-query / ai / rules / helpers
  auth/                # 微信登录 + 建用户 + 发 JWT
  family/              # 家长-孩子绑定管理
  tasks/ points/ exchanges/ advances/ weekly/ studynotes/
  options/ ai-usage/ categories/ share-stats/ init/
database/
  schema.sql           # MySQL DDL（全部业务表 + 用户三表）
miniprogram/           # 微信小程序（TDesign）
```

## 环境变量（云函数 / common Layer）

| 变量 | 说明 |
|------|------|
| `ENV_ID` | CloudBase 环境 ID |
| `JWT_SECRET` | JWT 签发密钥（务必使用强随机值，禁止硬编码） |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` | CloudBase MySQL 连接信息 |

## 部署要点

1. 将 `cloudfunctions/common` 发布为 CloudBase **Layer**（命名如 `study-common`），各业务函数引用该 Layer。
2. 各函数 `package.json` 中 `cloudfunctions/common` 通过 Layer 路径解析（部署后在函数内以 `../common` 或 Layer 挂载路径引用）。
3. 配置 `advances` 的**定时触发器**：每月 1 日 0 点执行自动还款。
4. 数据库执行 `database/schema.sql` 建表。

> 本项目仅产出代码，环境开通与部署请使用 CloudBase 控制台 / CLI / MCP 工具。
