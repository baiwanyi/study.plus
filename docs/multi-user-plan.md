# 多用户模式改造方案

## 一、现状分析

本项目目前是**单用户模式**：

| 方面 | 现状 |
|------|------|
| 认证 | 无。`isAdmin()` 仅通过 `window.location.hostname === 'localhost'` 判断 |
| 数据库 | 所有表无 `userId` 字段，所有数据属于唯一"用户" |
| 权限 | 仅区分"管理员/非管理员"，非管理员无限制但只是隐藏了部分按钮 |
| 多设备 | 不支持 |
| 角色 | 无 |

## 二、方案整体架构

```
┌─────────────────────────────────────────────────────┐
│                   账号系统                            │
│          (username + password 登录)                   │
└────────────┬────────────────────────────┬────────────┘
             │                            │
     ┌───────▼────────┐          ┌───────▼────────┐
     │   家长端 (Parent)  │          │   学生端 (Student)  │
     │                   │          │                   │
     │ 全部权限:          │          │ 受限权限:          │
     │ - 配置选项          │          │ - 作业提交/编辑    │
     │ - 规则管理          │          │ - 积分查看         │
     │ - 删除操作          │          │ - 周报填写         │
     │ - 积分添加/兑换      │          │ - 学习心得        │
     │ - 所有管理功能       │          │ - 视频播放        │
     └────────────────────┘          └────────────────────┘
             │                            │
             └──────────┬─────────────────┘
                        │
            ┌───────────▼───────────┐
            │   设备端模式切换        │
            │                       │
            │ 登录后:                │
            │ - 默认 = 家长端        │
            │ - 可切换至学生端        │
            │ - 切回家长端需验证密码  │
            └───────────────────────┘
```

### 核心设计理念

- 一个"account" 对应一个**家庭**，**不是**家长和学生各一个账号
- 一个账号（家庭）下的设备可通过模式切换实现家长/学生角色分离
- 多设备可同时登录同一账号，每台设备独立设置模式
- 家长端可以无限制切换到学生端，学生端切回家长端需验证密码

## 三、详细改造方案

### Phase 1：数据库层 — 用户表与数据隔离

#### 1.1 新建表：`accounts`

```sql
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,   -- bcrypt 加密
  label TEXT NOT NULL DEFAULT '', -- 账户显示名称
  parent_password TEXT,          -- 家长验证密码（用于从学生端切回）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

#### 1.2 更新迁移脚本

在 `server/src/db/migrate.ts` 中现有表创建后新增 `accounts` 表的创建逻辑。

#### 1.3 为所有业务表添加 `account_id` 字段

以非破坏性方式（ALTER TABLE ADD COLUMN）为以下表添加 `account_id`：

| 表名 | 新增列 | 说明 |
|------|--------|------|
| `tasks` | `account_id INTEGER` | 作业属于谁 |
| `submissions` | （通过 tasks 关联） | 从 tasks 继承 |
| `point_records` | `account_id INTEGER` | 积分记录归属 |
| `exchanges` | `account_id INTEGER` | 兑换记录归属 |
| `point_advances` | `account_id INTEGER` | 预支记录归属 |
| `month_summary` | `account_id` 列 + `account_id + month` 联合唯一 | 每月每个账户的结算 |
| `weekly_reports` | `account_id INTEGER` | 周报归属 |
| `studynotes` | `account_id INTEGER` | 学习心得归属 |
| `ai_usage_logs` | `account_id INTEGER` | AI 用量归属 |
| `ai_score_logs` | `account_id INTEGER` | AI 评分日志归属 |

> **注意**：`videos` 表（视频设备级）暂不加 `account_id`。

**迁移策略**：为已有数据设置 `account_id = 1`（迁移后自动创建默认账户）。

#### 1.4 修改 Drizzle Schema

在 `server/src/db/schema.ts` 中为所有表添加 `accountId` 字段，更新 `accounts` 表定义。

### Phase 2：后端 — 认证系统

#### 2.1 新增认证路由：`server/src/routes/auth.ts`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/register` | POST | 注册账号（用户名 + 密码 + 家长验证密码） |
| `/api/auth/login` | POST | 登录，返回 JWT Token |
| `/api/auth/verify-password` | POST | 验证家长密码（用于切换回家长端） |
| `/api/auth/profile` | GET | 获取当前用户信息 |
| `/api/auth/change-password` | PUT | 修改密码 |

#### 2.2 JWT 认证机制

- 使用 `jsonwebtoken` 签发 Token（设置 `expiresIn: '30d'`）
- JWT Secret 从环境变量 `JWT_SECRET` 读取
- Token 中携带 `accountId`、`username` 和 `mode`
- 前端将 Token 存储在 `localStorage`，每个请求通过 `Authorization: Bearer <token>` 携带

#### 2.3 认证中间件：`server/src/middleware/auth.ts`

```typescript
// 解析 JWT 并注入 req.account
// 所有 /api/* 路由除 /api/auth/* 外均需该中间件
```

#### 2.4 账户初始化

- 首次启动时，若 `accounts` 表为空，自动创建默认账户（用户名从环境变量读取）
- 提供 `INITIAL_ADMIN_USERNAME` 和 `INITIAL_ADMIN_PASSWORD` 环境变量

#### 2.5 路由改造

所有现有路由的查询改为 `WHERE account_id = req.account.id`：

```typescript
// 修改前
const taskRows = await db.select().from(tasks)
// 修改后
const taskRows = await db
  .select()
  .from(tasks)
  .where(eq(tasks.accountId, req.account.id))
```

所有写入操作需注入 `accountId`。

### Phase 3：后端 — 角色与权限控制

**关键要点**：权限控制主要在**前端**实现，后端不做角色校验。

原因：学生端的核心限制是"不能管理/删除"，这些操作都在前端 UI 层面控制。后端 API 本身不区分家长/学生，只要认证通过即可操作。家长密码验证也是前端+API 配合实现。

后端仅确保：
- 所有 API 需要 JWT 认证
- 数据按 `accountId` 隔离
- 提供密码验证端点供前端切换角色使用

JWT Payload 中携带 `mode: 'parent' | 'student'`，当前设备登录时可选择模式。

### Phase 4：前端 — 认证与登录

#### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `apps/src/pages/Login.tsx` | 登录/注册页面 |
| `apps/src/components/AuthProvider.tsx` | 认证上下文（AuthContext） |
| `apps/src/hooks/useAuth.ts` | 认证状态 Hook |

#### 4.2 AuthProvider 核心功能

```typescript
interface AuthState {
  isAuthenticated: boolean
  account: { id: number; username: string; label: string } | null
  mode: 'parent' | 'student'  // 当前设备模式
  token: string | null
}

// 暴露方法
login(username, password) -> Promise<void>
logout() -> void
switchToStudentMode() -> void  // 无密码切换
switchToParentMode(password) -> Promise<boolean>  // 需验证密码
```

#### 4.3 登录流程

1. 未登录 → 显示 Login 页面（路由 `/login`）
2. 输入用户名/密码 → POST `/api/auth/login`
3. 返回 JWT Token → 存储到 `localStorage` + AuthContext
4. 跳转到首页，默认模式为 `parent`

#### 4.4 设备模式切换

1. 在 Layout 侧边栏底部或页面右上角添加**模式切换**控件
2. **家长端 → 学生端**：一键切换，无需密码
   - 显示切换确认：`确认切换到学生端？学生端将隐藏管理功能和删除操作`
3. **学生端 → 家长端**：弹出密码验证表单
   - 输入"家长验证密码" → POST `/api/auth/verify-password` → 验证通过后切换
4. 模式状态存储在 `localStorage` + AuthContext

### Phase 5：前端 — 权限控制改造

#### 5.1 替换现有的 `isAdmin()`

当前 `isAdmin()` 基于 hostname 判断，改造后应先判断认证状态，再基于 `mode` 判断。

```typescript
// shared/src/utils.ts 或 apps/src/utils/client.ts
export function isParentMode(): boolean {
  return authContext.mode === 'parent'
}
```

创建权限 Hook：

```typescript
export function usePermission() {
  const { mode } = useAuth()
  return {
    canManage: mode === 'parent',   // 管理功能（配置/规则）
    canDelete: mode === 'parent',   // 删除功能
    canAdmin: mode === 'parent',    // 管理员功能（同 manage）
    isStudent: mode === 'student',
  }
}
```

#### 5.2 需改造的 UI 元素

| 页面/组件 | 需要隐藏/禁用的功能 |
|-----------|-------------------|
| **Layout.tsx** | 侧边栏不显示"配置选项"链接 |
| **main.tsx** | `/options` 路由仅在家长端才可访问 |
| **Tasks/index.tsx** | 删除功能、编辑标题/类型 |
| **TaskListTable.tsx** | 删除按钮、编辑名称按钮 |
| **Points/index.tsx** | "添加记录"按钮 |
| **Exchanges/index.tsx** | "添加兑换"按钮、撤销操作 |
| **Borrow/index.tsx** | 预支功能（学生只能查看，不能操作） |
| **Weekly/index.tsx** | 删除周报功能 |
| **Studynotes/index.tsx** | 删除学习心得功能 |
| **Options/\*** | 所有规则配置页面（家长端专属） |
| **OptionsSystem.tsx** | 系统设置、名言管理、年级设置等 |

### Phase 6：路由改造

#### 6.1 路由结构调整

在 BrowserRouter 外层包裹 `AuthProvider`，添加 ProtectedRoute 和登录路由：

```tsx
<AuthProvider>
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        {/* ... 原有路由 ... */}
        <Route path="options" element={<ParentRoute><Rules /></ParentRoute>} />
      </Route>
    </Route>
  </Routes>
</AuthProvider>
```

#### 6.2 ProtectedRoute 组件

检查 `isAuthenticated`，未登录则重定向到 `/login`。

#### 6.3 ParentRoute 组件

检查 `mode === 'parent'`，否则重定向到首页。

### Phase 7：API 请求改造

#### 7.1 自动添加 Authorization header

在 `request.ts` 中，每个请求自动携带 Token：

```typescript
export async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('token')
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options?.headers,
  }
  // ...
}
```

#### 7.2 Token 过期处理

当收到 401 响应时，自动跳转到登录页面。

### Phase 8：数据库迁移与数据兼容

#### 8.1 迁移脚本

在 `migrate.ts` 中添加：
1. 创建 `accounts` 表
2. 为所有业务表添加 `account_id` 列（ALTER TABLE）
3. 创建默认账户（用户名从环境变量读取）
4. 将所有现有数据的 `account_id` 设为默认账户 ID
5. 为 `month_summary` 表添加 `account_id` 列，更新唯一索引

#### 8.2 向后兼容

数据库非空迁移时，所有现有数据自动关联到默认管理员账户。

### Phase 9：安全设计

1. **密码安全**：使用 `bcrypt`（`bcryptjs` 纯 JS 实现，无原生依赖）哈希存储
2. **JWT Secret**：从环境变量 `JWT_SECRET` 读取，无默认值，启动时检查并报错
3. **家长验证密码**：可选字段，用于从学生端切回家长端
4. **Token 存储**：前端使用 `localStorage`，不暴露到 Cookie
5. **Token 刷新**：短期 Token（30天），后续可增加刷新机制
6. **首次安装**：提供环境变量配置默认管理员账号

## 四、涉及文件清单

### 新增文件（12个）

| 文件路径 | 说明 |
|---------|------|
| `server/src/db/migrations/002_accounts.ts` | 账号表数据迁移 |
| `server/src/routes/auth.ts` | 认证 API（注册/登录/验证密码） |
| `server/src/middleware/auth.ts` | JWT 认证中间件 |
| `server/src/utils/password.ts` | 密码哈希工具函数 |
| `apps/src/pages/Login.tsx` | 登录/注册页面 |
| `apps/src/components/AuthProvider.tsx` | 认证上下文 Provider |
| `apps/src/hooks/useAuth.ts` | 认证状态 Hook |
| `apps/src/hooks/usePermission.ts` | 权限判断 Hook |
| `apps/src/components/ProtectedRoute.tsx` | 认证保护路由 |
| `apps/src/components/ParentRoute.tsx` | 家长端保护路由 |
| `apps/src/components/ModeSwitcher.tsx` | 模式切换 UI 组件 |
| `apps/src/utils/api/auth.ts` | 认证相关的 API 调用 |

### 需修改文件（25+个）

#### 后端（7个）

| 文件 | 修改内容 |
|------|---------|
| `server/package.json` | 新增依赖：`bcryptjs`、`jsonwebtoken`、`@types/bcryptjs`、`@types/jsonwebtoken` |
| `server/src/index.ts` | 注册 auth 路由 + 挂载认证中间件 |
| `server/src/db/migrate.ts` | 添加 accounts 表创建 + 数据迁移 |
| `server/src/db/schema.ts` | 添加 accounts 表定义 + 所有表添加 accountId |
| `server/src/routes/tasks.ts` | 所有查询添加 `eq(tasks.accountId, ...)` |
| `server/src/routes/points.ts` | 所有查询添加 `eq(pointRecords.accountId, ...)` |
| `所有其他 routes` | 共约 10 个 router 文件，每个都需要添加 accountId 过滤 |

#### 前端（16+个）

| 文件 | 修改内容 |
|------|---------|
| `apps/src/main.tsx` | 包裹 AuthProvider + ProtectedRoute + 登录路由 |
| `apps/src/components/Layout.tsx` | 添加模式切换控件 + 账户信息显示 |
| `apps/src/utils/api/request.ts` | 自动添加 Authorization header |
| `apps/src/utils/api/index.ts` | 新增 authApi 导出 |
| `apps/src/utils/client.ts` | `isAdmin()` 改造为基于 AuthContext |
| `apps/src/pages/Tasks/index.tsx` | 删除操作加权限判断 |
| `apps/src/pages/Tasks/TaskListTable.tsx` | 删除/编辑按钮加权限判断 |
| `apps/src/pages/Points/index.tsx` | 添加按钮加权限判断 |
| `apps/src/pages/Exchanges/index.tsx` | 添加/撤销操作加权限判断 |
| `apps/src/pages/Borrow/index.tsx` | 预支操作加权限判断 |
| `apps/src/pages/Weekly/index.tsx` | 删除操作加权限判断 |
| `apps/src/pages/Studynotes/index.tsx` | 删除操作加权限判断 |
| `apps/src/pages/Options/*` | 家长端专属页面，通过路由保护 |
| `shared/src/types.ts` | 添加账号相关类型定义 |
| `shared/src/constants.ts` | 添加默认配置 |

## 五、多端登录说明

**方案特点**：

1. **Token 机制天然支持多端**：JWT Token 可同时在 PC 和 Pad 上使用
2. **每端独立模式设置**：模式状态存储在每台设备的 `localStorage` 中，互不影响
   - PC：登录 → 保持家长端 → 不切换
   - Pad：登录 → 切换到学生端 → localStorage 保存模式状态
3. **退出登录不影响另一端**：一端退出仅清除该端 Token
4. **可选：统一踢出**：可在后端维护 Token 白名单（Redis 或数据库表），实现一端的踢出

## 六、实施优先级与工作量估算

| 阶段 | 内容 | 工作量估计 | 核心难度 |
|------|------|-----------|---------|
| Phase 1 | 数据库层（表 + Schema + 迁移） | 3-4h | ⭐⭐ |
| Phase 2 | 后端认证系统 | 4-5h | ⭐⭐⭐ |
| Phase 3 | 后端权限中间件 + 路由适配 | 3-4h | ⭐⭐ |
| Phase 4 | 前端认证 UI（登录/注册/AuthProvider） | 4-5h | ⭐⭐⭐ |
| Phase 5 | 前端权限控制改造 | 5-6h | ⭐⭐ |
| Phase 6 | 路由改造（ProtectedRoute/ParentRoute） | 2-3h | ⭐ |
| Phase 7 | API 请求 layer 改造 | 1-2h | ⭐ |
| Phase 8 | 模式切换控件 + 家长验证 | 3-4h | ⭐⭐ |
| Phase 9 | 测试 + 错误处理 | 3-4h | ⭐⭐ |
| **合计** | | **28-37h** | |

## 七、关键决策

### 7.1 为什么不用已有用户表而新建 `accounts` 表？

目前所有业务表均为单用户设计，没有用户系统。`accounts` 表的 "account" 概念对应一个"家庭"，**不是**指家长和学生各一个账号。一个家庭一个账号，设备端通过模式切换来实现家长/学生角色分离。这样设计最简洁，符合"家庭学习管理"的产品定位。

### 7.2 为什么权限控制主要在前端？

本项目是家庭自用工具，不是多租户 SaaS 系统。学生端的目的是"防止孩子误操作管理功能"，不是严格的安全隔离。前端控制 + 家长切换时需要验证密码，已经满足家庭使用场景。同时，后端不做角色校验可以减少大量修改，降低风险。

### 7.3 为什么用 JWT 而不是 Session？

JWT 无状态，天然支持多端登录，无需服务端维护 Session 存储。前端简单存储在 `localStorage`，多设备互不影响。
