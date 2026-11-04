# 多用户改造方案：家庭管理员与子账号

> 目标读者：本项目的实施者。文档按模块组织，每个模块给出「设计结论 + 落地位置 + 可验收标准」，
> 不讨论与实施无关的产品设想。所有文件路径均相对仓库根目录。

## 0. 与既有方案的差异（必读）

本文档替换此前的「一家庭一账号 + 设备模式切换」方案。旧方案的两处结论在本版本中被推翻：

| 旧方案结论 | 本方案结论 | 推翻理由 |
| --- | --- | --- |
| 一个账号代表一个家庭，家长/孩子靠前端 `mode` 切换 | 家庭组下分真实账号，家长和孩子各自独立登录 | `mode` 存在 `localStorage`，孩子清空浏览器数据或换浏览器即恢复管理员视图；且多孩子共用一个积分账户，无法区分是谁的作业、谁扣的分 |
| 后端不做角色校验，权限只在前端控制 | 后端为唯一可信授权层，前端只做可见性 | 引入子账号后，`GET /api/tasks` 若不按身份过滤，孩子可直接读到其他孩子的全部数据（横向越权），前端隐藏按钮无法阻止直接调接口 |

唯一保留的旧结论：JWT 无状态令牌 + 前端 `localStorage` 存储 + 多设备各自持令牌，这部分在新方案中继续沿用。

## 1. 现状与改造边界

### 1.1 代码现状（改造起点）

| 方面 | 现状 | 证据 |
| --- | --- | --- |
| 接口鉴权 | 单一共享密钥 `X-API-Key`，由 `API_KEY` 环境变量提供 | `server/src/index.ts` 的 `requireApiKey` |
| 前端密钥 | `VITE_API_KEY` 编译进 `dist` 的 JS | `apps/src/services/request.ts` |
| 管理员判定 | `window.location.hostname === 'localhost' / 127.0.0.1 / VITE_ADMIN_DOMAINS` | `apps/src/utils/client.ts` 的 `isAdmin()` |
| 数据归属 | 业务表无任何用户字段，全库视为同一主体 | `server/src/db/schema.ts`（20 张表） |
| 迁移方式 | 单文件幂等 SQL + `try/catch` 跳过已存在对象，无版本表 | `server/src/db/migrate.ts` |
| 端点规模 | 约 75 个（9 个业务路由模块 + `index.ts` 内 2 个） | `server/src/routes/*` |
| 定时任务 | 月度预支还款、每日备份，均全局扫描 | `server/src/index.ts` 的 `setupMonthlyRepayment` / `setupDailyBackup` |

`VITE_API_KEY` 是公开信息（浏览器可见），只能当作「部署级防扫描门槛」，**不能**承担身份认证职责。

### 1.2 设计目标

1. 家庭为隔离边界，家长（家庭管理员）可创建、编辑、停用子账号。
2. 子账号只能访问自己的学习数据，且不能执行管理类操作。
3. 权限校验由服务端强制，前端仅负责界面可见性。
4. 现有单用户数据零丢失迁移：全部归属「默认家庭 + 默认子账号」。
5. 单孩子家庭不增加操作负担（首次初始化时可只建一个孩子账号）。

### 1.3 非目标（本版不做）

- 跨家庭共享、家庭间转学、教师/班级角色。
- 多家长协作的细粒度权限差异（`parent` 角色仅预留，行为与 `owner` 一致）。
- OAuth / 邮箱验证 / 找回密码邮件链路（家庭自建内网部署，由 owner 重置即可）。
- 计费、多租户配额。

## 2. 总体模型：家庭组 / 成员 / 数据归属

### 2.1 三层概念

```
families（家庭组，隔离边界，tenant）
   └── users（成员，role = owner | parent | child）
          └── 业务数据（family_id 保证隔离，child_id 保证归属）
```

- **family_id**：隔离边界。所有业务查询必须带此条件，任何跨家庭访问一律按「不存在」处理（返回 404 而非 403，避免探测）。
- **child_id**：数据归属人，取值为 `users.id`（`role = 'child'` 的那一行）。管理员视角下可空（查看全部孩子），孩子视角下恒等于自身 id。

### 2.2 为什么数据归属孩子而非账号

现有业务语义是「一个孩子在攒积分、写作业、做测验」。账号只是访问凭据，积分与作业的归属主体是孩子。若按账号归属，一个家庭有第二个孩子时就无法拆分积分，月度结算、预支还款、分享卡片全部失真。

因此：`point_records`、`tasks`、`weekly_reports`、`study_lessons`、`exchanges`、`point_advances` 等表一律以 `child_id` 为归属；`family_id` 是冗余列，用于一次 `WHERE` 完成租户隔离，避免每次都 JOIN `users`。

冗余 `family_id` 还有一项安全收益：子账号伪造 `childId` 时，双条件 `family_id = ctx.familyId AND child_id = ?` 仍会命中不到数据，构成第二道防线。

### 2.3 每个孩子是独立账本

`month_summary`、`point_advances` 的语义从「家庭账本」变为「孩子账本」。这会连带影响：

- 月度结算与预支还款（`server/src/index.ts` 的 `setupMonthlyRepayment`、`server/src/routes/advance-helper.ts`）必须按 `child_id` 分组执行，不能再用一次全局 `SELECT`。
- 首页看板（`apps/src/pages/Dashboard/*`）在 owner 视角需要「选择孩子」或「汇总所有孩子」两种模式；建议 V1 采用「当前选中孩子」切换器，实现成本最低。

## 3. 模块一：家庭管理员账号体系

### 3.1 角色定义

| role | 含义 | 数量约束 | 标识方式 |
| --- | --- | --- | --- |
| `owner` | 家庭管理员（家长），家庭创建者 | 每家庭恰好 1 个 | `users.role = 'owner'` |
| `parent` | 第二家长（预留，V2 启用） | 每家庭 0..n | `users.role = 'parent'` |
| `child` | 子账号（孩子） | 每家庭 1..n | `users.role = 'child'` |

身份标识在三个层面必须一致，任何一处单独存在都不作为授权依据：

| 层面 | 标识 | 用途 |
| --- | --- | --- |
| 数据层 | `users.role` + `users.status` | 持久化事实，每次请求回查 |
| 令牌层 | JWT payload 的 `sub` / `fid` / `role` / `tv` | 请求期传递，含 `token_version` 用于吊销 |
| 前端 | `session.role` | 仅控制界面可见性 |

### 3.2 注册流程（家庭首次初始化）

本项目是单部署、单入口的家庭工具，不存在公开注册页。注册分两条路径：

**路径 A：首次初始化（一键建家庭 + 管理员）**

```
GET  /api/auth/bootstrap-status  -> { initialized: boolean }
POST /api/auth/bootstrap         -> 创建 families + users(role=owner)，返回登录令牌
```

- 仅当 `families` 表为空时可调用，否则返回 409，避免线上被二次接管。
- 表单字段：家庭名称、管理员显示名、登录名、密码（≥ 8 位）、可选「立即创建第一个孩子」。
- 首次初始化替代当前的 `INITIAL_ADMIN_*` 环境变量思路：密码经表单设置，不落 `.env`，避免明文密码随部署目录扩散。
- 初始化成功后写入 `audit_logs`（`action = 'family.bootstrap'`）。

**路径 B：管理员后续新增家长（V2）**

`POST /api/family/invites` 生成一次性邀请码（有效期 24 小时，单次可用），第二家长凭码设置自己的密码加入同一 `family_id`，角色 `parent`。V1 不实现，但表结构需预留（邀请码存 `family_invites`，见 7.1 可选表）。

### 3.3 账号信息结构

```sql
CREATE TABLE IF NOT EXISTS families (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  code        TEXT NOT NULL,              -- 6 位家庭码，孩子登录时输入
  status      TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS families_code_unique ON families(code);

CREATE TABLE IF NOT EXISTS users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('owner', 'parent', 'child')),
  login_name      TEXT NOT NULL,          -- 家庭内唯一；孩子可为中文昵称
  display_name    TEXT NOT NULL,
  password_hash   TEXT NOT NULL,          -- owner/parent: bcrypt cost>=10；child: 6 位 PIN 的 bcrypt
  status          TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled')),
  token_version   INTEGER NOT NULL DEFAULT 0,   -- 递增即吊销该用户全部令牌
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT,
  last_login_at   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS users_family_login_unique ON users(family_id, login_name);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,          -- 刷新令牌 jti
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id     INTEGER NOT NULL,
  refresh_hash  TEXT NOT NULL,             -- 刷新令牌的 sha256，不存明文
  device_label  TEXT,
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
```

`sessions` 的作用不是「有状态会话」，而是设备可撤销与异常登录排查：access token 保持 30 分钟无状态校验，refresh token 落库以便单设备踢出。

### 3.4 管理员身份标识与令牌载荷

```ts
// shared/src/types.ts
export type FamilyRole = 'owner' | 'parent' | 'child'

export interface SessionUser {
    userId: number
    familyId: number
    role: FamilyRole
    childId: number | null      // role === 'child' 时为自身 id，否则 null
    displayName: string
}

export interface AccessTokenClaims {
    sub: number                 // userId
    fid: number                 // familyId
    role: FamilyRole
    tv: number                  // token_version，与 users.token_version 比对
    iat: number
    exp: number
}
```

- 签名密钥：`JWT_SECRET`，无默认回退值；缺失时**服务启动即失败**（与现有 `API_KEY` 的 fail-fast 一致）。
- access token 有效期 30 分钟，refresh token 30 天（`sessions.expires_at`）。
- `req.auth` 由中间件注入，路由层不得再从 `req.body` / `req.query` 读取 `familyId`。

### 3.5 权限边界

| 边界 | owner | child |
| --- | --- | --- |
| 数据范围 | 本 `family_id` 内全部孩子的数据 | 仅 `child_id = self` |
| 跨家庭 | 禁止（凭 id 猜测也返回 404） | 禁止 |
| 部署级配置（系统设置、题库目录） | 可读写 | 不可见 |
| 账号管理 | 全部 | 无 |
| 会话吊销 | 可停用子账号、可踢设备 | 只能退出自身 |

`VITE_ADMIN_DOMAINS` 与 `isAdmin()` 在本方案中**彻底删除**：局域网部署下所有成员从同一 hostname（如 `192.168.1.10:3006`）进入，hostname 不具备区分身份的能力。README 与 `server/.env.example` 中的对应条目需同步清理。

## 4. 模块二：子账号（孩子账号）管理

### 4.1 创建机制

```
POST   /api/family/children        -> 创建子账号（owner）
GET    /api/family/children        -> 列出本家庭子账号（owner）
PATCH  /api/family/children/:id    -> 改显示名 / 重置 PIN（owner）
POST   /api/family/children/:id/status -> 停用 / 启用（owner，需 step-up）
DELETE /api/family/children/:id    -> 删除（owner，需 step-up，见 4.4）
```

创建参数与约束：

| 字段 | 校验 | 说明 |
| --- | --- | --- |
| `displayName` | 1–20 字符 | 界面上显示的名字 |
| `loginName` | 2–20 字符，家庭内唯一 | 孩子登录时输入；允许中文 |
| `pin` | 恰好 6 位数字 | 便于孩子输入，不要求复杂度 |
| 可选初始数据 | 无 | 不复用其他孩子的数据 |

创建时写入 `family_id = ctx.familyId`、`role = 'child'`、`status = 'active'`，返回时**不得**返回 `password_hash`（遵循 DTO 白名单）。

### 4.2 编辑与凭据重置

- 修改显示名：直接 `PATCH`。
- 重置 PIN：`PATCH` 携带 `pin`，同时 `token_version + 1`，使孩子当前所有设备令牌失效（防止 PIN 泄露后被继续使用）。
- 不允许把 `role = 'child'` 提升为 `owner`（无此接口，路由层拒绝）。

### 4.3 停用与启用

停用采用**软删除**：`users.status = 'disabled'` + `token_version + 1`。

- 停用后：登录返回 401「账号已停用」；已签发但未过期的 access token 因 `tv` 不匹配立即失效（最多一个请求周期）。
- 停用不影响业务数据：积分、作业、周报全部保留。
- 重新启用：`status = 'active'`，需要重新设置 PIN（不沿用旧 PIN，避免家长误以为凭据未泄露）。

### 4.4 删除

删除是破坏性且不可逆的操作，且涉及未成年人数据。约束：

1. 必须通过 step-up 重新校验 owner 密码（见 5.4）。
2. 二次确认文案明确写出「将永久删除该孩子的作业、积分、周报、学习记录」。
3. 执行时按外键级联删除，同时删除 `ai_usage_logs` / `audit_logs` 中的关联明细（审计日志可保留操作记录但脱敏姓名）。
4. 建议 V1 只提供「停用」，把「删除」放到系统设置的危险区域，并在执行前自动触发一次数据库备份（复用 `server/src/services/backup.ts` 的快照能力）。

### 4.5 家庭组绑定关系

- 子账号通过 `users.family_id` 绑定家庭，**无独立家庭归属**，不支持跨家庭迁移。
- 孩子无法查看、也无法退出家庭（无对应端点）。
- 家庭码（`families.code`）是孩子登录的定位依据：家长可轮换（`POST /api/family/rotate-code`，需 step-up），轮换后已登录设备不受影响，但新登录必须使用新码。

### 4.6 子账号登录方式

孩子端不暴露「账号注册」，采用「家庭码 + 登录名 + 6 位 PIN」三段式：

```
POST /api/auth/login/child
{ "familyCode": "830421", "loginName": "小明", "pin": "123456" }
```

实现要点：

- 先按 `families.code` 定位家庭，再按 `(family_id, login_name)` 查用户，最后校验 PIN。三段任一失败统一返回「家庭码、用户名或 PIN 不正确」，不区分错误来源，避免枚举。
- 限流：`express-rate-limit` 单独一档，`windowMs = 10 分钟，max = 10`，按 `IP + familyCode` 计数；连续失败 5 次锁定该账号 15 分钟（`failed_attempts` / `locked_until`）。
- 家长登录走 `POST /api/auth/login`，用 `login_name + password`（家庭内唯一即可登录，家庭码仅用于孩子端）。
- 登录成功后返回 `{ accessToken, refreshToken, user: SessionUser }`，前端不再需要 `VITE_API_KEY` 作为身份凭据（但仍保留 `X-API-Key` 作为部署门槛）。

## 5. 模块三：权限模型设计

### 5.1 模型选型

采用 **RBAC + 数据范围（scope）双层模型**，而非纯 RBAC：

1. 第一层：角色决定「能做什么动作」（`role -> permission set`）。
2. 第二层：身份决定「能对谁的数据做」（`owner: family 内全部` / `child: 仅 self`）。

只有两层同时通过才放行。这一分层是必须的：如果只做 RBAC，孩子的 `task:read` 权限会让他读到全家的作业；如果只做数据过滤，孩子仍可能调用 `exchange:revoke` 撤销自己的兑换记录。

### 5.2 权限点定义

命名统一为 `<资源>:<动作>`，集中定义在 `shared/src/permissions.ts`（新增），前后端共用同一份常量，避免两侧漂移。

| 资源 | 动作 | 说明 |
| --- | --- | --- |
| `task` | `read` `create` `update` `delete` `score` | `score` 指触发 AI 评分并写入积分 |
| `point` | `read` `write` | `write` 含手动加扣分 |
| `exchange` | `read` `create` `revoke` | `revoke` 指撤销兑换并退分 |
| `advance` | `read` `create` | 预支与分期 |
| `weekly` | `read` `create` `update` `delete` `analyze` | `analyze` 指 AI 分析（消耗额度） |
| `study` | `read` `write` `quiz` | 预习 / 心得 / 测验 |
| `lesson` | `read` `create` `update` `delete` | 课程 |
| `library` | `read` | 本地题库 |
| `rule` | `read` `write` | 家庭级规则配置 |
| `system` | `read` `write` | 部署级设置（自动保存间隔、题库路径等） |
| `aiUsage` | `read` | AI 用量统计 |
| `child` | `read` `create` `update` `status` `delete` | 子账号管理 |
| `family` | `update` `rotateCode` | 家庭信息与家庭码 |

### 5.3 角色权限矩阵

| 权限点 | owner | child | 依据 |
| --- | --- | --- | --- |
| `task:read` | 全部孩子 | 仅自己 | 孩子需要看到自己的待办作业 |
| `task:create` | 是 | 否 | 作业由家长布置 |
| `task:update` | 是 | 仅自己的内容提交 | 孩子要能写作业、改草稿 |
| `task:delete` | 是 | 否 | 删除是管理动作 |
| `task:score` | 是 | 仅自己的作业 | 评分是学习闭环的一部分，保留给孩子但受配额约束 |
| `point:read` | 是 | 仅自己 | 孩子需要看到自己得了多少分 |
| `point:write` | 是 | 否 | 加分权必须在家长 |
| `exchange:read` | 是 | 仅自己 | |
| `exchange:create` | 是 | 否 | 兑换是家长授予奖励；V2 可改为「孩子申请 + 家长批准」 |
| `exchange:revoke` | 是 | 否 | |
| `advance:read` | 是 | 仅自己 | |
| `advance:create` | 是 | 否 | 预支涉及还款义务 |
| `weekly:*` | 是 | `read/create/update` 仅自己，无 `delete` | 周报由孩子填写、家长审阅 |
| `study:*` | 是 | `read/write/quiz` 仅自己 | 学习中心是孩子主战场 |
| `lesson:*` | 是 | `read` 仅自己 | 课程由家长建立 |
| `library:read` | 是 | 是 | 题库为家庭共享只读资源 |
| `rule:*` | 是 | 否 | 规则变更是家长专属 |
| `system:*` | 是 | 否 | |
| `aiUsage:read` | 是 | 否 | 涉及 API 成本 |
| `child:*` / `family:*` | 是 | 否 | |

补充约束（不体现在权限点，体现在数据层）：

- 孩子的 `task:score` 受 `rules` 中的每日/每月 AI 评分次数配额限制（复用现有 AI 限流思路，见 `server/src/routes/lessons.ts` 的每小时 30 次限流）。
- 孩子不能修改 `tasks.title` / `tasks.type`（`PATCH` 接口对 child 只接受 `content` 字段，其余字段忽略并返回 400）。

### 5.4 权限校验实现

三层校验，缺一不可。

**第一层：认证中间件**（`server/src/middleware/auth.ts`，新增）

```ts
/**
 * 解析 Bearer 令牌并回查用户状态，向 Request 注入可信的 auth 上下文。
 * 每次请求都校验 users.status 与 token_version，使停用与重置 PIN 立即可吊销旧令牌。
 */
import { and, eq } from 'drizzle-orm'
import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../db/index'
import { users } from '../db/schema'
import type { NextFunction, Request, Response } from 'express'
import type { AccessTokenClaims, SessionUser } from '@shared/types'

declare module 'express-serve-static-core' {
    interface Request {
        auth?: SessionUser
    }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    if (!token) {
        res.status(401).json({ error: '未登录' })
        return
    }
    let claims: AccessTokenClaims
    try {
        claims = jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenClaims
    } catch {
        res.status(401).json({ error: '登录已失效，请重新登录' })
        return
    }
    const rows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, claims.sub), eq(users.status, 'active')))
    const user = rows[0]
    if (!user || user.tokenVersion !== claims.tv) {
        res.status(401).json({ error: '登录已失效，请重新登录' })
        return
    }
    req.auth = {
        userId: user.id,
        familyId: user.familyId,
        role: user.role,
        childId: user.role === 'child' ? user.id : null,
        displayName: user.displayName,
    }
    next()
}
```

**第二层：动作鉴权中间件**（`server/src/middleware/permission.ts`，新增）

```ts
import type { NextFunction, Request, Response } from 'express'
import { ROLE_PERMISSIONS } from '@shared/permissions'
import type { Permission } from '@shared/permissions'

export function requirePermission(permission: Permission) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const auth = req.auth
        if (!auth) {
            res.status(401).json({ error: '未登录' })
            return
        }
        if (!ROLE_PERMISSIONS[auth.role].has(permission)) {
            res.status(403).json({ error: '当前账号无权执行该操作' })
            return
        }
        next()
    }
}
```

**第三层：数据范围守卫**（`server/src/middleware/scope.ts`，新增）

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/index'
import { tasks } from '../db/schema'
import type { Request } from 'express'

// child 视角强制收敛到自身；owner 视角按请求参数选择孩子，未指定则不加 child 条件
export function resolveChildScope(req: Request): number | null {
    const auth = req.auth
    if (!auth) throw new Error('auth context missing')
    if (auth.role === 'child') return auth.childId
    const raw = Number(req.query.childId)
    return Number.isInteger(raw) && raw > 0 ? raw : null
}

// 按 id 直接访问单条资源时必须做归属断言，防止横向越权（IDOR）
export async function assertTaskOwned(req: Request, taskId: number): Promise<void> {
    const auth = req.auth
    if (!auth) throw new Error('auth context missing')
    const rows = await db
        .select({ id: tasks.id, childId: tasks.childId })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.familyId, auth.familyId)))
    const task = rows[0]
    // 跨家庭与不存在一律 404，避免通过状态码探测资源归属
    if (!task) throw new HttpError(404, '作业不存在')
    if (auth.role === 'child' && task.childId !== auth.childId) {
        throw new HttpError(404, '作业不存在')
    }
}
```

**挂载顺序**（`server/src/index.ts`）

```ts
app.use('/api/tasks', requireApiKey, requireAuth, tasksRouter)
app.use('/api/points', requireApiKey, requireAuth, pointsRouter)
// ... 其余 7 个业务路由同理
app.use('/api/auth', authLimiter, authRouter)   // 认证路由自行限流，不套 requireAuth
```

路由内部再按动作挂权限：

```ts
router.post('/', requirePermission('task:create'), createHandler)
router.post('/:id/score', requirePermission('task:score'), scoreHandler)
router.delete('/:id', requirePermission('task:delete'), deleteHandler)
```

**step-up 二次校验**（敏感操作）

`POST /api/auth/step-up`（携带 owner 密码）返回 5 分钟有效的 `stepUpToken`；`child:status`、`child:delete`、`family:rotateCode` 三个端点额外要求请求头 `X-Step-Up` 且校验通过。令牌内绑定 `userId` 与用途，不可复用于其他动作。

### 5.5 前端可见性（仅 UX，不是安全边界）

```ts
// apps/src/hooks/usePermission.ts（新增）
import { useAuth } from './useAuth'
import { ROLE_PERMISSIONS } from '@shared/permissions'
import type { Permission } from '@shared/permissions'

export function usePermission() {
    const { session } = useAuth()
    const role = session?.role ?? null
    return {
        role,
        isOwner: role === 'owner',
        isChild: role === 'child',
        can: (permission: Permission) => (role ? ROLE_PERMISSIONS[role].has(permission) : false),
    }
}
```

替换点（全部为现有 `isAdmin()` 调用，共 11 处以上，须逐个改为具体权限判断，不要保留 `isAdmin` 包装）：

| 文件 | 现有判断 | 改后 |
| --- | --- | --- |
| `apps/src/main.tsx` | `isAdmin() && <Route path="options">` | 路由嵌套在 `<RequireRole roles={['owner']} />` 下，并新增 `/family` 账号管理路由 |
| `apps/src/components/Layout.tsx` | `isAdmin()` 决定导航项 | `can('rule:read')` 决定「配置选项」；新增账号切换/退出入口 |
| `apps/src/pages/Weekly/WeeklyListTable.tsx` | `isAdmin()` 控制删除按钮 | `can('weekly:delete')` |
| `apps/src/pages/Exchanges/index.tsx` | `isAdmin()` 控制「添加兑换」 | `can('exchange:create')` |
| `apps/src/pages/Exchanges/ExchangesListTable.tsx` | `isAdmin()` 控制撤销 | `can('exchange:revoke')` |
| `apps/src/pages/Borrow/index.tsx` | `isAdmin()` 控制预支 | `can('advance:create')` |
| 其余 `Points` / `Tasks` / `Study` / `Usage` 页 | 同上 | 按 5.3 矩阵逐项对应 |

`apps/src/utils/client.ts` 的 `isAdmin()` 直接删除（保留其余工具函数）；`VITE_ADMIN_DOMAINS` 从 `apps/src/vite-env.d.ts`、README、`.env.example` 一并移除。

### 5.6 必须逐项改造的越权面

引入多用户后，以下端点从「安全」变为「高危」，改造时按此清单逐个确认，不可遗漏：

| 端点 | 风险 | 改造要求 |
| --- | --- | --- |
| 所有列表 `GET` | 返回全家数据 | 注入 `family_id` + `child_id` 条件 |
| 所有 `/:id` 的 `PUT` / `DELETE` | 直接按 id 操作，可越权改他人数据 | 先 `assertXxxOwned` 再执行 |
| `POST /api/points/advance` | 为孩子创建还款义务 | `advance:create` + 显式 `childId` 归属校验 |
| `POST /api/exchanges/:id/revoke` | 撤销他人兑换并退分 | 归属校验 + `exchange:revoke` |
| `POST /api/study/quiz/:id/submit` | 提交他人测验 | 通过 `study_quiz.study_id -> study_lessons.child_id` 断言 |
| `GET /api/ai-usage` | 泄露全家调用量与成本 | `aiUsage:read` 仅 owner |
| `PUT /api/options/:key` | 改全家规则或部署设置 | `rule:write` / `system:write` 分流，部署级 key 仅 owner |
| `GET /api/library/*` | 题库为纯文件读取 | 只加 `library:read`，无需数据隔离 |
| `GET /api/images`、`GET /api/system` | 只读公共资源 | 保持公开或仅 `system:read` |

## 6. 模块四：同类产品做法与依据

| 产品 | 家庭多用户与权限机制 | 对本项目的可借鉴点 |
| --- | --- | --- |
| Google Family Link | 家庭组为管理边界；儿童账号由家长创建并「监督」，儿童不能自行注册或退出家庭；家长可暂停账号 | 家庭组即租户边界；子账号禁止自注册、禁止脱离家庭；提供「停用」而非直接删除 |
| Microsoft Family Safety | 家庭组 + 成员角色；家长可对成员设置屏幕时间与内容限制；成员数据按成员维度统计 | 数据按孩子维度独立记账（`child_id`），而非家庭合计 |
| Apple 家庭共享 | 角色分 organizer / adult / child；儿童成员的关键操作触发「Ask to Buy」需组织者批准 | 兑换、预支等涉及积分与承诺的动作归属家长；可演进为「孩子申请 + 家长审批」 |
| ClassDojo / Seesaw | 教师建立班级，学生凭班级码 + 姓名/头像加入，无邮箱；学生只有提交与查看权限 | 孩子登录用「家庭码 + 登录名 + PIN」，不引入邮箱；孩子权限收敛到提交与查看 |
| Netflix / YouTube Kids 的 profile 模型 | 同一订阅下多个 profile，每个 profile 独立观看历史与限制；切换 profile 可设 PIN | 同一家庭多个孩子各自独立数据与独立 PIN；切换身份需重新认证 |

提炼为五条设计原则，本方案已逐条落实：

1. **家庭组是唯一隔离边界**，成员不跨组（对应 `families` + `family_id`）。
2. **儿童账号由成人代建，禁止自注册与自行退出**（对应 4.1 / 4.5，无自助注册与退出端点）。
3. **儿童凭证轻量化**（家庭码 + 昵称 + 6 位 PIN），但服务端限流与锁定不能省（对应 4.6）。
4. **动作权限与数据归属分离**，关键动作二次校验（对应 5.1 / 5.4 step-up）。
5. **成人可随时停用/重置儿童账号且业务数据保留**（对应 4.3 软删除 + `token_version` 吊销）。

## 7. 数据模型调整点

### 7.1 新增表

| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `families` | 家庭组 | `code` 唯一 |
| `users` | 家庭成员（owner/parent/child 同表） | `(family_id, login_name)` 唯一 |
| `sessions` | 刷新令牌与设备管理 | `user_id` 索引 |
| `audit_logs` | 敏感操作审计 | `(family_id, created_at)` 索引 |
| `schema_migrations` | 迁移版本记录（治理现有 `try/catch` 风格） | `version` 主键 |

`audit_logs` 建议字段：`id, family_id, actor_user_id, action, target_type, target_id, detail(JSON), ip, created_at`。至少记录：登录失败、子账号创建/停用/删除、PIN 重置、家庭码轮换、规则修改、兑换撤销。

### 7.2 业务表改造

新增列一律先以**可空**方式添加（SQLite 的 `ADD COLUMN ... NOT NULL` 需要常量默认值，无法直接回填历史行的真实归属），回填完成后再由重建表脚本收紧为 `NOT NULL`。

| 表 | 新增列 | 归属判定 | 回填规则 |
| --- | --- | --- | --- |
| `tasks` | `family_id`, `child_id` | 直接归属 | 全部指向默认家庭 + 默认孩子 |
| `submissions` | 不加 | 经 `task_id` 继承 | — |
| `ai_score_logs` | 不加 | 经 `task_id` 继承 | — |
| `point_records` | `family_id`, `child_id` | 直接归属 | 同上 |
| `exchanges` | `family_id`, `child_id` | 直接归属 | 同上 |
| `point_advances` | `family_id`, `child_id` | 直接归属 | 同上 |
| `month_summary` | `family_id`, `child_id` | 直接归属 | 同上，`month` 全局唯一改为 `(child_id, month)` |
| `weekly_reports` | `family_id`, `child_id` | 直接归属 | 同上，`(year, week_number)` 改为 `(child_id, year, week_number)` |
| `weekly_conversations` / `weekly_messages` | 不加 | 经 `weekly_report_id` 继承 | — |
| `task_conversations` / `task_messages` | 不加 | 经 `task_id` 继承 | — |
| `study_lessons` | `family_id`, `child_id` | 直接归属 | 同上，`(subject, topic)` 改为 `(child_id, subject, topic)` |
| `study_previews` / `study_notes` / `study_quiz` / `study_preview_quiz` | 不加 | 经 `lesson_id` 继承 | — |
| `ai_usage_logs` | `family_id`, `child_id` | 直接归属（可空，部署级调用无归属） | 同上 |
| `options` | `family_id` | `0` 表示部署级全局，`>0` 表示家庭级 | 现有 `system` 类 key 置 `0`，规则类 key 复制到默认家庭 |

关键判断：`study_lessons` 按孩子独立，而不是家庭共享。理由是其唯一索引为 `(subject, topic)`，若家庭共享，两个孩子的同名课程会撞唯一键，且预习、心得、测验全部挂在 lesson 上，共享会导致孩子的测验成绩互相覆盖。代价是同一门课要为每个孩子各建一条，家庭场景下可接受。

### 7.3 唯一索引冲突清单（必须一并重建）

| 现有索引 | 冲突场景 | 改为 |
| --- | --- | --- |
| `options.key`（唯一） | 两个家庭不能有同名规则 | `(family_id, key)` 唯一 |
| `month_summary.month`（唯一） | 两个孩子在同月各需一行 | `(child_id, month)` 唯一 |
| `week_year_unique(year, week_number)` | 两个孩子同一周各写一份周报 | `(child_id, year, week_number)` 唯一 |
| `study_lessons_subject_topic_unique` | 两个孩子各有「数学 / 分数」课程 | `(child_id, subject, topic)` 唯一 |
| `submissions.task_id`（唯一） | 无冲突 | 保持 |
| `study_quiz_study_id_pending_unique`（部分唯一） | 通过 `study_id` 继承孩子维度 | 保持 |
| `study_previews.lesson_id` / `study_preview_quiz.lesson_id`（唯一） | 通过 lesson 继承 | 保持 |

新增索引（覆盖高频过滤）：

```sql
CREATE INDEX IF NOT EXISTS tasks_family_child_created_idx ON tasks(family_id, child_id, created_at);
CREATE INDEX IF NOT EXISTS point_records_family_child_created_idx ON point_records(family_id, child_id, created_at);
CREATE INDEX IF NOT EXISTS exchanges_family_child_created_idx ON exchanges(family_id, child_id, created_at);
CREATE INDEX IF NOT EXISTS ai_usage_logs_family_child_created_idx ON ai_usage_logs(family_id, child_id, created_at);
```

### 7.4 迁移脚本策略

现有 `server/src/db/migrate.ts` 是「一个函数、顺序执行、try/catch 跳过已存在」，缺乏版本记录，无法安全表达「回填 + 收紧约束」这类多步操作。建议在同一文件中引入版本表，不引入新的迁移框架：

```ts
const steps: Array<{ version: string; run: () => Promise<void> }> = [
    { version: '2026-11-01-multiuser-schema', run: createMultiUserTables },
    { version: '2026-11-01-multiuser-backfill', run: backfillOwnership },
    { version: '2026-11-01-multiuser-indexes', run: rebuildUniqueIndexes },
]

for (const step of steps) {
    const applied = await client.execute({
        sql: 'SELECT 1 FROM schema_migrations WHERE version = ?',
        args: [step.version],
    })
    if (applied.rows.length > 0) continue
    await step.run()
    await client.execute({
        sql: 'INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime(\'now\'))',
        args: [step.version],
    })
}
```

回填逻辑（默认家庭与默认孩子）：

1. 建 `families` 一行：`name = '默认家庭'`，`code` 随机 6 位。
2. 建 `users` 一行：`role = 'owner'`，`login_name` 取 `ADMIN_LOGIN_NAME`（默认 `admin`），`password_hash` 取 `ADMIN_INITIAL_PASSWORD` 的 bcrypt 值；两者缺省时生成随机密码并**在迁移日志中打印一次**（不落库、不落 `.env`）。
3. 建 `users` 一行：`role = 'child'`，`login_name` 取 `DEFAULT_CHILD_NAME`（默认 `宝贝`）。
4. 把全部业务表的历史行写成 `family_id = 1, child_id = <默认孩子 id>`。
5. 重建 7.3 表中的唯一索引（先 `DROP INDEX`，再 `CREATE UNIQUE INDEX`）。
6. `PRAGMA foreign_keys` 在重建表期间按现有脚本的模式临时关闭，结束后恢复。

迁移前置条件（写进脚本头部注释并实现为断言）：库文件存在、`PRAGMA integrity_check` 通过、迁移前自动复制一份 `.bak` 快照（`server/data/study.db.bak-<时间戳>`）。

## 8. 实施步骤

每个阶段独立可验证，出问题可停在上一个阶段的稳定态。

### 阶段 0：准备（0.5 天）

1. 建分支 `feat/multi-user`。
2. 备份现有数据库：复制 `server/data/study.db`（含 `-wal` / `-shm`）到仓库外目录。
3. 在 `server/src/db/migrate.ts` 引入 `schema_migrations` 表并登记当前结构为基线版本。
4. 验收：`pnpm db:migrate` 连续执行两次无副作用（幂等）。

### 阶段 1：数据模型（1 天）

1. 按 7.1 新增 4 张表，按 7.2 为 9 张表加列，按 7.3 重建 4 个唯一索引并新增 4 个普通索引。
2. 同步 `server/src/db/schema.ts`（Drizzle 定义）。
3. 编写回填脚本，跑在副本库上验证。
4. 验收：副本库迁移后 `SELECT COUNT(*) FROM tasks WHERE child_id IS NULL` 为 0；`PRAGMA foreign_key_check` 无输出；`integrity_check` 返回 `ok`。

### 阶段 2：认证后端（1.5 天）

1. 新增依赖：`bcryptjs`（纯 JS，无原生编译）、`jsonwebtoken` 及其类型包。
2. 新增 `server/src/middleware/auth.ts`、`server/src/routes/auth.ts`、`server/src/services/password.ts`、`server/src/services/token.ts`。
3. 端点：`bootstrap-status`、`bootstrap`、`login`、`login/child`、`refresh`、`logout`、`profile`、`change-password`、`step-up`。
4. `JWT_SECRET` 缺失时 `process.exit(1)`，与 `API_KEY` 一致。
5. 认证路由单独限流（登录 10 次/10 分钟，按 IP + 账号）。
6. 验收：`server/__test__` 新增用例覆盖——错误密码返回统一文案、停用账号无法登录、`tv` 变化后旧令牌 401、连续 5 次失败触发锁定。

### 阶段 3：授权与路由改造（2.5 天）

1. 新增 `shared/src/permissions.ts` 与 `server/src/middleware/permission.ts`、`scope.ts`。
2. `server/src/index.ts` 为 9 个业务路由挂 `requireAuth`；`/api/auth` 不挂。
3. 按 5.6 清单逐模块改造：`tasks.ts`(12) / `studynotes.ts`(17) / `points.ts`(13) / `lessons.ts`(11) / `weekly.ts`(7) / `library.ts`(5) / `options.ts`(3) / `exchanges.ts`(3) / `ai-usage.ts`(2)。
4. 改造 `advance-helper.ts` 的月度还款：由「全局扫描」改为「按 `child_id` 分组遍历」；`summary-helper.ts` 的月度汇总按孩子重算。
5. `options.ts` 读写按 `family_id` 分流，部署级 key（`system`）固定 `family_id = 0` 且要求 `system:*` 权限。
6. 验收：新增集成测试，至少覆盖三类越权——A 孩子读 B 孩子作业返回 404；孩子调 `POST /api/points` 返回 403；孩子调 `DELETE /api/tasks/:id` 返回 403。

### 阶段 4：前端认证与守卫（1.5 天）

1. 新增 `apps/src/components/AuthProvider.tsx`、`apps/src/hooks/useAuth.ts`、`apps/src/hooks/usePermission.ts`、`apps/src/components/RequireAuth.tsx`、`apps/src/components/RequireRole.tsx`、`apps/src/pages/Login/index.tsx`、`apps/src/services/auth.ts`。
2. `apps/src/services/request.ts`：改为携带 `Authorization: Bearer <accessToken>`；收到 401 时先尝试 `refresh`，失败则清理会话并跳转 `/login`；`X-API-Key` 保留为部署门槛。
3. `apps/src/main.tsx`：`AuthProvider` 包裹路由，新增 `/login` 与 `/family`，把 `/options`、`/usage`、`/family` 收进 `RequireRole roles={['owner']}`。
4. 删除 `isAdmin()` 与 `VITE_ADMIN_DOMAINS` 的全部引用。
5. 验收：未登录访问任意页面跳转 `/login`；孩子账号登录后侧边栏不出现「配置选项」「AI 使用量」「账号管理」；家长登录后可见。

### 阶段 5：子账号管理与多孩子切换（1.5 天）

1. 新增 `apps/src/pages/Family/index.tsx`（列表 + 创建 + 编辑 + 停用/启用 + 重置 PIN + 家庭码轮换），配套 `apps/src/services/family.ts`。
2. 新增孩子切换器（侧边栏或顶栏），owner 切换 `childId` 后各页面按新 `childId` 重新取数；child 登录时切换器隐藏。
3. 修正 `localStorage` 命名空间：字帖样式（`apps/src/pages/Handwriting/index.tsx`）、积分备注快捷选项等所有 `localStorage` key 需加 `u<userId>:` 前缀，避免同一浏览器切换账号后串数据。
4. 验收：家长创建两个孩子，分别登录后积分与作业互不可见；切换器切换后首页数据随之变化。

### 阶段 6：迁移演练与上线（1 天）

1. 在真实库副本上演练完整迁移 + 前后端联调。
2. 记录迁移耗时与库体积变化。
3. 上线顺序：停止服务 → 备份库 → `node migrate.mjs` → 启动服务 → 用默认管理员密码登录并立即修改密码 → 创建第一个子账号。
4. 回滚方案：保留迁移前的 `.bak` 与旧版本产物，回滚时恢复库文件 + 回退代码。
5. 验收：迁移后历史作业、积分、周报数量与原库一致（逐表 `COUNT(*)` 对比，逐项记录）。

## 9. 风险提示

| 风险 | 影响 | 缓解措施 |
| --- | --- | --- |
| 迁移不可逆 | 库结构变更后无法直接回退 | 迁移前强制备份（脚本内自动 `.bak` + 人工副本）；分阶段提交，每阶段可停 |
| SQLite 加列后无法直接收紧 `NOT NULL` | 长期存在可空脏数据 | 回填后加校验任务：启动时检测 `child_id IS NULL` 的行数并告警；必要时走重建表脚本 |
| 现有 `VITE_API_KEY` 无法撤销 | 泄露后任何人可绕过部署门槛 | 它只是门槛不是身份；真正的隔离靠 JWT + `family_id`。建议上线后轮换一次 `API_KEY` 并重新构建前端 |
| 子账号 PIN 弱口令 | 孩子 PIN 被同伴猜中 | 6 位数字 + 5 次失败锁定 15 分钟 + 登录限流；家长可随时重置 PIN（自动吊销旧令牌） |
| 横向越权遗漏 | 某个 `/:id` 接口未加归属断言，孩子可读写他人数据 | 按 5.6 清单逐个勾稽；集成测试覆盖三类越权；代码评审时对所有 `where(eq(x.id, id))` 检查是否带 `family_id` |
| `localStorage` 数据串号 | 同一浏览器两个账号看到彼此的偏好设置 | 阶段 5 统一加 `u<userId>:` 前缀并写迁移逻辑（首次读取时把旧 key 归给当前用户） |
| 前端令牌被 XSS 读取 | 会话劫持 | 现有 CSP（`script-src 'self'`）已收敛注入面；Markdown 渲染不含 `dangerouslySetInnerHTML` 未经清洗的调用；access token 短有效期（30 分钟）限制窗口 |
| 定时任务按孩子分组改造遗漏 | 只给一个孩子还款、其他孩子漏扣 | 改造后单测覆盖多孩子场景（2 个孩子各有 active 预支，验证各自只扣一次） |
| 未成年人信息合规 | 收集儿童学习数据需监护人同意 | 子账号创建页面显式声明「由监护人创建并同意数据用于学习记录」，勾选后才可提交；提供按孩子导出与删除（4.4） |
| 备份文件含全部家庭数据 | 邮件外发时未加密 | 单家庭部署风险有限；若将来多家庭，需按 `family_id` 分卷导出，并评估 zip 加密 |
| 删除孩子数据误操作 | 不可恢复 | V1 只提供停用；删除放进危险区域 + step-up + 二次确认 + 删除前自动快照 |
| 部署级与家庭级配置混淆 | 家长改了「本地题目目录」影响全站 | `options.family_id = 0` 的 key 仅 `system:*` 权限可写，UI 上分成「家庭设置」与「系统设置」两个页签 |

## 10. 工作量估算

| 阶段 | 内容 | 估算 |
| --- | --- | --- |
| 0 | 准备与迁移基线 | 0.5 天 |
| 1 | 数据模型 + 回填 | 1 天 |
| 2 | 认证后端 | 1.5 天 |
| 3 | 授权中间件 + 9 个路由改造 | 2.5 天 |
| 4 | 前端认证与路由守卫 | 1.5 天 |
| 5 | 子账号管理 + 多孩子切换 | 1.5 天 |
| 6 | 迁移演练与上线 | 1 天 |
| 合计 | | 9.5 天 |

风险缓冲建议按 20% 预留，实际排期约 11–12 人天。其中阶段 3 是主要工作量来源（约 75 个端点的归属校验）。

## 11. 后续迭代（V2 备选）

1. `parent` 角色启用：邀请码加入第二位家长，可限制「不能停用 owner」。
2. 「孩子申请 → 家长审批」的兑换流（对齐 Apple Ask to Buy）：新增 `approval_requests` 表与审批卡片。
3. 子账号 AI 配额：按孩子设定每日评分/出题次数，超限提示由家长审批。
4. 家长侧跨孩子汇总视图（对比两个孩子本月净积分趋势）。
5. 操作审计可视化页（`audit_logs` 查询与导出）。
