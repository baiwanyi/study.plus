# M1 账号与权限详细设计

> 本文是 `docs/miniprogram-transformation-plan.md` v2.2 第 3 章与 M1 里程碑的工程落地设计，覆盖 `families` / `members` / `child_profiles` 及配套表的 DDL、登录鉴权流程、令牌与会话、RBAC + 数据范围双层校验、云函数契约与越权测试用例。适用于新建的 CloudBase 微信小程序项目（空库起步，无历史数据迁移）。
>
> 核心原则：**身份只取自 `cloud.getWXContext()`，`family_id` 与 `child_id` 一律由服务端注入**；角色裁决与数据范围裁决分两层，前端隐藏按钮不是安全边界；跨家庭 / 跨孩子访问一律按「不存在」返回 404，避免资源枚举。

## 文档控制

| 项 | 内容 |
| --- | --- |
| 文档状态 | 设计稿（待研发评审；孩子登录方式需产品确认） |
| 版本 | v1.0 |
| 编制日期 | 2026-11-04 |
| 对应里程碑 | M1 身份与项目地基（10–14 人天）、M2 租户隔离与权限（10–14 人天） |
| 依赖文档 | `docs/miniprogram-transformation-plan.md`（第 3 章权限基线、第 9 章开放问题）、`docs/multi-user-plan.md`（RBAC 与越权面）、`docs/credit-ledger-design.md`（积分接口权限）、`docs/privacy-policy.md`（监护人同意与数据权利） |
| 运行环境 | CloudBase 云函数 Node.js 20 + MySQL 8.0 + NoSQL；`@cloudbase/js-sdk` v3 |
| 前置约束 | 新建独立仓库与三环境已就绪；v3 的历史缺陷转为本设计的验收约束，不 fork 旧认证代码 |

---

## 1. 概念模型与关键决策

```
families（家庭 = 租户 = 计费主体）
   ├── members（真实微信身份 / PIN 身份，承载登录与角色）
   │      └── member_child_bindings（child 角色可见的孩子档案集合）
   ├── child_profiles（孩子档案 = 成长积分与学习数据归属主体）
   ├── family_codes / invitations（家庭码、一次性邀请码）
   ├── sessions / consent_records / audit_logs（会话、同意留痕、审计）
   ├── credit_accounts / subscriptions（见 credit-ledger-design.md）
   └── 业务数据（每条带 family_id + child_id）
```

| 决策 | 结论 | 理由 |
| --- | --- | --- |
| 账号与孩子档案分离 | `members` 是登录身份，`child_profiles` 是数据主体，两者通过 `member_child_bindings` 关联 | v3 把孩子做成伪 openid 用户，导致孩子既不能登录又占账号位，`role='child'` 鉴权成为死代码 |
| V1 一个微信身份只归属一个家庭 | `members.openid` 唯一索引 | 简化隔离与邀请逻辑；多家庭需求在 M5 引入 `family_members` 关联表演进 |
| 孩子默认不引入微信账号 | 推荐「家庭码 + 孩子选择 + 6 位 PIN」，生成 `login_type='pin'` 的 member | 合规最简，对齐 ClassDojo；10 岁以上可选微信绑定并需监护人单独同意 |
| 家长设备内快速切换 | 更新 `sessions.active_child_id`，不新建账号 | 共用设备场景，数据仍归属被选中的孩子 |
| 不建物理外键 | 用逻辑外键 + 索引 + 事务保证 | 便于后续分库、归档与云函数独立部署 |
| 套餐上限不冗余 | 孩子数 / 成员数从 `subscriptions.plan_code` 经 `entitlement` 动态读取 | 避免 `families` 与订阅状态不一致 |

---

## 2. 数据表 DDL

> 全部使用参数化查询，禁止 SQL 拼接；金额与积分为整数，时间为 `DATETIME(3)`；索引命名统一 `uk_` / `idx_`；字符集 `utf8mb4`。

### 2.1 `families`（家庭 / 租户）

```sql
CREATE TABLE IF NOT EXISTS families (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name             VARCHAR(64) NOT NULL COMMENT '家庭名称',
    owner_member_id  BIGINT UNSIGNED NOT NULL COMMENT 'owner 成员ID，创建后不可变更',
    status           ENUM('active','frozen','closed') NOT NULL DEFAULT 'active',
    privacy_version  VARCHAR(32) NOT NULL DEFAULT '' COMMENT '家庭当前同意的隐私政策版本',
    created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_family_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭租户';
```

### 2.2 `members`（登录身份与角色）

```sql
CREATE TABLE IF NOT EXISTS members (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id        BIGINT UNSIGNED NOT NULL,
    openid           VARCHAR(128) DEFAULT NULL COMMENT '微信OPENID，仅服务端从云上下文取得',
    unionid          VARCHAR(128) DEFAULT NULL COMMENT '跨端唯一标识',
    login_type       ENUM('wechat','pin') NOT NULL DEFAULT 'wechat',
    role             ENUM('owner','parent','child','teacher') NOT NULL DEFAULT 'parent',
    nickname         VARCHAR(64) NOT NULL DEFAULT '',
    avatar_url       VARCHAR(512) NOT NULL DEFAULT '',
    phone            VARCHAR(32) DEFAULT NULL COMMENT '非必要不收集',
    status           ENUM('active','disabled','deleted') NOT NULL DEFAULT 'active',
    token_version    BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '递增即吊销全部已签令牌',
    pin_hash         VARCHAR(255) DEFAULT NULL COMMENT '仅 login_type=pin，加盐不可逆哈希',
    pin_fail_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    pin_locked_until DATETIME(3) DEFAULT NULL,
    privacy_version  VARCHAR(32) NOT NULL DEFAULT '',
    privacy_agreed_at DATETIME(3) DEFAULT NULL,
    last_login_at    DATETIME(3) DEFAULT NULL,
    created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_member_openid (openid),
    UNIQUE KEY uk_member_unionid (unionid),
    KEY idx_member_family_status (family_id, status, role),
    KEY idx_member_login_type (family_id, login_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成员账号';
```

**说明**：`openid` / `unionid` 为 `NULL` 时 MySQL 唯一索引允许多个，故 PIN 账号不冲突；`pin_hash` 必须为加盐不可逆哈希（argon2id 或 bcrypt），**禁止明文、禁止可逆加密、禁止日志输出**；`teacher` 角色为 M5 团队版预留，V1 不签发。

### 2.3 `child_profiles`（孩子档案）

```sql
CREATE TABLE IF NOT EXISTS child_profiles (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id           BIGINT UNSIGNED NOT NULL,
    nickname            VARCHAR(64) NOT NULL,
    grade               VARCHAR(32) NOT NULL DEFAULT '' COMMENT '年级',
    avatar_url          VARCHAR(512) NOT NULL DEFAULT '',
    status              ENUM('active','archived') NOT NULL DEFAULT 'active',
    created_by_member_id BIGINT UNSIGNED NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_child_family_status (family_id, status),
    KEY idx_child_nickname (family_id, nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='孩子档案';
```

**说明**：本表只放档案，不放成长积分余额（`point_records` / `month_summary` 按 `child_id` 独立记账）；每月初始分与积分规则从 NoSQL 的 `${familyId}:rules` 读取，不在此冗余。

### 2.4 `member_child_bindings`（账号 ↔ 孩子档案）

```sql
CREATE TABLE IF NOT EXISTS member_child_bindings (
    member_id        BIGINT UNSIGNED NOT NULL,
    child_profile_id BIGINT UNSIGNED NOT NULL,
    relation         ENUM('self','guardian') NOT NULL DEFAULT 'self',
    created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (member_id, child_profile_id),
    KEY idx_binding_child (child_profile_id, member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='成员可见的孩子档案集合';
```

**说明**：`role='child'` 的成员 V1 只绑定 1 个档案（服务层约束），多对多结构为 M5「一个微信管理多个孩子」预留；家长角色的可见范围不走本表，而是 `family_id` 下全部 `status='active'` 的孩子。

### 2.5 `family_codes` 与 `invitations`（家庭码与邀请码）

```sql
CREATE TABLE IF NOT EXISTS family_codes (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id   BIGINT UNSIGNED NOT NULL,
    code        VARCHAR(32) NOT NULL COMMENT '长期家庭码，用于孩子端登录',
    status      ENUM('active','rotated') NOT NULL DEFAULT 'active',
    rotated_at  DATETIME(3) DEFAULT NULL,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_family_code (code),
    UNIQUE KEY uk_family_active_code (family_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='家庭码';

CREATE TABLE IF NOT EXISTS invitations (
    id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id   BIGINT UNSIGNED NOT NULL,
    code_hash   CHAR(64) NOT NULL COMMENT '邀请码哈希，明文仅生成时返回一次',
    role        ENUM('parent') NOT NULL DEFAULT 'parent',
    expires_at  DATETIME(3) NOT NULL,
    max_uses    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    used_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    status      ENUM('active','used','expired','revoked') NOT NULL DEFAULT 'active',
    created_by_member_id BIGINT UNSIGNED NOT NULL,
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_invite_hash (code_hash),
    KEY idx_invite_family_status (family_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='一次性邀请码（24小时）';
```

**说明**：家庭码与邀请码必须用密码学安全随机数生成，不可由 `family_id` 推导；邀请码兑付在同一事务内 `UPDATE ... SET used_count = used_count + 1, status = CASE ... END WHERE status='active' AND used_count < max_uses AND expires_at > now()`，防止并发重复兑付。

### 2.6 `sessions`（refresh 会话）

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    member_id           BIGINT UNSIGNED NOT NULL,
    family_id           BIGINT UNSIGNED NOT NULL,
    refresh_token_hash  CHAR(64) NOT NULL,
    status              ENUM('active','rotated','revoked') NOT NULL DEFAULT 'active',
    active_child_id     BIGINT UNSIGNED DEFAULT NULL COMMENT '家长设备内快速切换的当前孩子',
    platform            VARCHAR(16) NOT NULL DEFAULT '',
    expires_at          DATETIME(3) NOT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_hash (refresh_token_hash),
    KEY idx_session_member_status (member_id, status),
    KEY idx_session_expire (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='刷新令牌会话';
```

**说明**：access token 为无状态 JWT，不落库；refresh token 只存哈希并支持旋转（旧 token 重放即判定为盗用，吊销整条会话链）。

### 2.7 `consent_records`（监护人同意留痕）

```sql
CREATE TABLE IF NOT EXISTS consent_records (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id           BIGINT UNSIGNED NOT NULL,
    consenter_member_id BIGINT UNSIGNED NOT NULL,
    child_profile_id    BIGINT UNSIGNED DEFAULT NULL,
    consent_type        ENUM('privacy_policy','children_rules','ai_processing','wechat_child_login') NOT NULL,
    policy_version      VARCHAR(32) NOT NULL,
    scope               VARCHAR(255) NOT NULL DEFAULT '',
    action              ENUM('grant','withdraw') NOT NULL,
    source              VARCHAR(32) NOT NULL DEFAULT 'popup',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_consent_family_time (family_id, created_at),
    KEY idx_consent_child (child_profile_id, consent_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='同意与撤回留痕（只追加）';
```

### 2.8 `audit_logs`（审计）

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id       BIGINT UNSIGNED NOT NULL DEFAULT 0,
    actor_member_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
    actor_role      VARCHAR(16) NOT NULL DEFAULT '',
    action          VARCHAR(64) NOT NULL,
    resource_type   VARCHAR(32) NOT NULL DEFAULT '',
    resource_id     VARCHAR(128) NOT NULL DEFAULT '',
    result          ENUM('success','denied') NOT NULL,
    reason          VARCHAR(128) NOT NULL DEFAULT '',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_audit_family_time (family_id, created_at),
    KEY idx_audit_actor (actor_member_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审计日志（不记录儿童内容明文）';
```

### 2.9 业务表隔离列

所有业务表（`tasks`、`point_records`、`point_advances`、`exchanges`、`weekly_reports`、`study_notes`、`quiz_records`、`*_messages`、`ai_usage_logs`、`rules` 等）**必须**带：

```sql
family_id  BIGINT UNSIGNED NOT NULL,
child_id   BIGINT UNSIGNED NOT NULL,
KEY idx_<table>_scope (family_id, child_id, created_at)
```

唯一索引按孩子 / 家庭维度重建：`(family_id, key)`、`(child_id, month)`、`(child_id, year, week_number)`、`(child_id, subject, topic)`。NoSQL 配置文档 key 统一为 `${familyId}:${key}`。

---

## 3. 登录与鉴权流程

### 3.1 家长微信登录（首次注册）

```
小程序 wx.cloud.callFunction({ name:'auth', data:{ action:'login', profile:{nickname,avatarUrl} } })
   │  ⚠ 客户端不传 openid / familyId / role
   ▼
[auth.login]
   1. cloud.getWXContext() → OPENID / UNIONID（唯一可信来源）
   2. 按 openid 查 members
      ├─ 存在 → 校验 status='active'、隐私版本 → 签发令牌
      └─ 不存在 → 事务 T1：
            INSERT families(owner_member_id=0, name)
            INSERT members(family_id, openid, unionid, role='owner', login_type='wechat')
            UPDATE families SET owner_member_id = <memberId>
            INSERT child_profiles(第一个孩子档案，昵称取微信昵称或家长填写)
            INSERT credit_accounts(family_id, balance=体验积分)  ← 见账本设计
            INSERT family_codes(高熵随机家庭码)
            INSERT consent_records（监护人同意，需前端单独弹窗先行）
   3. 写 audit_logs(login, success)
   ▼
返回 accessToken(30min) + refreshToken(30d) + { familyId, role, children[] }
```

**硬约束**：拒绝 `event.openid` / `event.familyId` / `event.role` 等任何客户端自报身份字段；`event.userInfo` 只用于头像昵称展示，不用于身份判定。

### 3.2 孩子登录（推荐方案 A：家庭码 + PIN）

```
1. family.resolveChildren(familyCode) → 返回 [{ childProfileId, nickname }]（不含学习数据），限流
2. 用户选择孩子并输入 6 位 PIN
3. [auth.loginByPin]
   a. familyCode → families(status='active')
   b. childProfileId 必须属于该 family（否则 404）
   c. member_child_bindings + members(role='child', login_type='pin', status='active') → member
   d. 校验 pin_locked_until；比对 pin_hash（argon2id）
      失败 → 原子 UPDATE pin_fail_count = pin_fail_count + 1；达 5 次置 pin_locked_until = now + 15min，返回 423
      成功 → 清零 pin_fail_count / pin_locked_until
   e. 签发令牌，sessions.active_child_id = childProfileId，childScope = [childProfileId]
4. 写 audit_logs
```

**可选方案 B（孩子微信绑定）**：家长在「家庭管理」生成绑定邀请 → 孩子微信扫码 → `auth.bindChildWechat` 创建 `login_type='wechat'` 的 child member 并写 `consent_records(wechat_child_login)`（须监护人单独同意）。**可选方案 C（家长设备内快速切换）**：`family.switchChild` 只更新 `sessions.active_child_id`，不新建账号。

### 3.3 令牌与会话

| 项 | 设计 |
| --- | --- |
| access token | JWT（HS256 或 RS256），30 分钟；载荷 `sub=memberId`、`fid=familyId`、`role`、`tv=token_version`、`scope=childScope`；不含儿童姓名、内容、密钥 |
| refresh token | 30 天，高熵随机；仅哈希落 `sessions`；每次刷新旋转（旧记录置 `rotated`，新记录 `active`） |
| 验签流程 | 验签 → 查 `members.status='active'` → 比对 `tv` 与 `members.token_version` → 校验 `fid` 与成员家庭一致 → 生成 `AuthContext` |
| 吊销触发 | 停用成员、重置 PIN、owner 变更、注销家庭、退订争议处置 → `token_version` 递增；相关 `sessions` 置 `revoked` |
| 重放检测 | 使用已 `rotated` / `revoked` 的 refresh token → 判定盗用，吊销该 member 全部会话并要求重新登录 |
| 401 处理 | 客户端清缓存（含按身份维度隔离的读缓存）并 `reLaunch` 到登录页 |

### 3.4 公共层函数

| 函数 | 职责 |
| --- | --- |
| `getAuthContext(event)` | 从云上下文 + 验签令牌构造 `{ familyId, memberId, role, childScope, sessionId }`；忽略客户端自报身份 |
| `scopeFilter(ctx, requestedChildId)` | 生成参数化 `WHERE family_id = ? AND child_id IN (...)`；child 角色强制用 `childScope`，忽略 `requestedChildId` |
| `assertRole(ctx, ...roles)` | 角色不足返回 403 |
| `assertPermission(ctx, resource, action)` | 查权限矩阵，返回 403 |
| `requireTargetChild(ctx, childId)` | 校验目标孩子属于本家庭且在可见集合内，否则返回 **404**（避免资源枚举） |
| `issueTokens` / `rotateRefresh` / `revokeAll` | 令牌签发、旋转、吊销 |
| `audit(ctx, action, result, reason)` | 写 `audit_logs`，自动脱敏 |

**统一响应**沿用 `common/entry.ts` 的 `{ code, error, message, data }`；生产环境不返回错误堆栈。

---

## 4. 权限矩阵（RBAC + 数据范围双层）

| 资源 | 动作 | owner | parent | child | 数据范围约束 |
| --- | --- | --- | --- | --- | --- |
| 作业 tasks | 布置 / 编辑 / 删除 | 是 | 是 | 否 | 目标孩子须 `requireTargetChild` |
| 作业 tasks | 查看 / 提交 | 全部孩子 | 全部孩子 | 仅自己 | `scopeFilter` |
| AI 能力 | `entitlement.reserve` | 是 | 是 | 仅自己的作业 | 扣家庭消费积分，见账本设计 |
| 成长积分 | 手动加减 | 是 | 是 | 否 | 按 `child_id` |
| 积分规则 rules | 修改 | **是** | 否 | 否 | NoSQL key 带 `family_id` |
| 兑换 exchanges | 发起 / 撤销 | 是 | 是 | 仅申请 | 按 `child_id` |
| 预支 advances | 创建 | **是** | 否 | 否 | 按 `child_id` |
| 周报 / 心得 / 测验 | 读写 | 全部孩子 | 全部孩子 | 仅自己 | 测验截止走服务端裁决 |
| 消费积分 credit | `getBalance` / `listLedger` | 是 | **只读** | **否（403）** | 按 `family_id` |
| 消费积分 credit | `createOrder` / 购买 / 补充包 | **是（独占）** | 否 | 否 | 付费入口仅 owner 端展示 |
| 家庭 family | 成员管理 / 邀请码 / 套餐 / 账单 | 是 | 否 | 否 | 不可停用或删除 owner |
| 隐私 privacy | 导出 / 删除 / 注销 / 同意管理 | **是** | 否 | 否 | 监护人行使 |
| 分享 / 题库 | 使用 | 是 | 是 | 是 | 只读共享资源 |

**返回码约定**：角色无权限 → `403`；资源不属于本家庭或不在可见孩子集合 → `404`；未登录 / 令牌失效 → `401`；PIN 锁定 → `423`；限流 → `429`。禁止用「资源存在但无权限」的 `403` 暴露跨家庭资源。

---

## 5. 云函数契约

| 云函数 | action | 关键入参 | 出参 | 主要错误 |
| --- | --- | --- | --- | --- |
| `auth` | `login` | `profile`（微信登录） | `tokens`, `member`, `family`, `children` | 401 / 429 |
| `auth` | `loginByPin` | `familyCode`, `childProfileId`, `pin` | `tokens`, `member`, `activeChildId` | 401 / 404 / 423 / 429 |
| `auth` | `refresh` | `refreshToken` | `tokens` | 401（重放则吊销会话链） |
| `auth` | `logout` | — | — | — |
| `family` | `createChild` | `nickname`, `grade` | `childProfile` | 403 / 402（超出套餐孩子数上限） |
| `family` | `resolveChildren` | `familyCode` | `children[]`（仅 id + 昵称） | 404 / 429 |
| `family` | `switchChild` | `childProfileId` | `activeChildId` | 403 / 404 |
| `family` | `createInvite` | — | `code`, `expiresAt` | 403（仅 owner） |
| `family` | `join` | `code` | `member` | 403 / 409（重复/过期） |
| `family` | `updateMember` | `memberId`, `status` | `member` | 403（不可停用 owner） |
| `family` | `rotateFamilyCode` | — | `code` | 403（仅 owner） |
| `consent` | `grant` / `withdraw` | `consentType`, `policyVersion`, `scope` | `record` | 403（仅 owner/parent 监护人） |
| `privacy` | `export` / `delete` | — | 导出文件 / 删除结果 | 403（仅 owner） |

所有入参中的 `familyId` / `memberId` / `role` / `childId`（作为身份而非目标时）一律**不接受客户端传值**；`childId` 作为业务目标时须经 `requireTargetChild` 校验。

---

## 6. 越权与安全测试用例

> M1/M2 的 CI 门禁用例，每项须单独列出通过 / 失败，不接受「全部通过」的汇总结论。用例 7/8 与 `docs/credit-ledger-design.md` 用例 15/16 互相呼应，须一起执行。

### 6.1 身份伪造

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 1 | 伪造 `event.openid` | 在 `auth.login` 事件里传入他人 openid | 身份取自 `getWXContext()`，伪造值被忽略；返回调用者自己的身份 |
| 2 | 伪造 `event.familyId` / `event.role` | 在业务云函数事件里传入他人 familyId 与 `role='owner'` | 参数被忽略；仍按令牌上下文裁决；`audit_logs` 记录 denied |
| 3 | 客户端自报 `childId` 越孩子 | child 账号传同家庭另一孩子的 `childId` 查作业 | `scopeFilter` 强制用 `childScope`，返回 404 或仅自己的数据，不泄露他人数据 |
| 4 | 家庭码枚举 | 高频调用 `family.resolveChildren` 猜测家庭码 | 触发 429 限流；返回信息仅含 id 与昵称，不含学习数据 |

### 6.2 跨家庭 / 跨孩子

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 5 | 跨家庭读作业 | 家庭 A 账号带家庭 B 的 `taskId` 读取 | 404，且响应不区分「不存在」与「无权限」 |
| 6 | 跨家庭改规则 | 家庭 A 账号写家庭 B 的 `rules` 文档 key | 404 / 不生效；B 家庭规则未变化 |
| 7 | 跨家庭操作积分账本 | 家庭 A 账号传 B 的 `familyId` 调 `credit.getBalance` | 403 或返回 A 自己的余额；B 账务无变化（账本设计用例 15） |
| 8 | 同家庭跨孩子写操作 | parent 用 A 孩子 ID 却传 B 孩子 ID 提交作业 | 参数化校验后落到正确孩子，或 404；不给 B 孩子加分 |
| 9 | NoSQL 配置串户 | 家庭 A 修改积分规则 | 仅 `${A}:rules` 变化；B 读取 `${B}:rules` 不受影响 |
| 10 | 切换孩子后缓存串数据 | 依次切换 A → B 孩子并读取列表 | 缓存 key 含三元组，读到各自数据；无残留 |

### 6.3 角色权限

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 11 | child 调管理接口 | child 调 `family.updateMember` | 403 |
| 12 | child 读消费积分余额 | child 调 `credit.getBalance` / `listLedger` | 403；页面无钱包入口（账本设计用例 16） |
| 13 | child 发起购买 | child 调 `billing.createOrder` | 403；不生成订单 |
| 14 | parent 修改积分规则 | parent 调 `family.updateRules` | 403 |
| 15 | parent 创建预支 | parent 调 `advances.create` | 403 |
| 16 | parent 生成邀请码 | parent 调 `family.createInvite` | 403 |
| 17 | parent 导出 / 注销 | parent 调 `privacy.export` / `privacy.delete` | 403 |
| 18 | 停用 owner | 任意账号尝试停用或删除 owner | 403；owner 数量恒为 1 |
| 19 | child 发起 AI 评分 | child 对自己的作业调 `entitlement.reserve` | 允许，但扣家庭账户积分且目标孩子限定为自己；对他人作业返回 404 |

### 6.4 令牌与会话

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 20 | 停用成员后旧 access token | owner 停用 parent，parent 用旧令牌调接口 | 401（`token_version` 已递增） |
| 21 | 停用成员后 refresh | 用该成员 refresh token 续期 | 401；会话置 `revoked` |
| 22 | refresh 重放 | 使用已旋转的旧 refresh token | 401，并吊销该成员全部会话链 |
| 23 | 令牌载荷篡改 | 修改 JWT 的 `fid` / `role` / `tv` | 验签失败，401 |
| 24 | 过期令牌 | 使用超过 30 分钟的 access token | 401；客户端清缓存并回到登录页 |

### 6.5 凭证与限流

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 25 | PIN 连续失败 | 连续 5 次错误 PIN | 第 5 次返回 423 并锁定 15 分钟；`pin_fail_count` 原子递增 |
| 26 | 锁定期内正确 PIN | 锁定期内输入正确 PIN | 仍 423，不签发令牌 |
| 27 | PIN 存储检查 | 查看 `members.pin_hash` 与日志 | 为加盐不可逆哈希，无明文、无日志输出 |
| 28 | 邀请码重复使用 | 同一邀请码连续兑付 2 次 | 第 2 次 409；成员数不增加 |
| 29 | 邀请码过期 | 使用超过 24 小时的邀请码 | 409 |
| 30 | 邀请码并发兑付 | 两个请求同时使用同一邀请码 | 事务内 CAS，仅 1 次成功 |
| 31 | 家庭码旋转 | owner 旋转家庭码后用旧码登录 | 旧码 404，新码可用 |

### 6.6 数据与运维

| # | 场景 | 步骤 | 预期结果 |
| --- | --- | --- | --- |
| 32 | 定时还款按孩子分组 | 月底触发每月 1 日还款 | 每个 `child_id` 各扣一次，不多扣不漏扣 |
| 33 | 隐私导出范围 | owner 调 `privacy.export` | 含全部孩子业务数据与 `*_messages`，不含其他家庭数据（表清单与 DDL 自动比对） |
| 34 | 注销级联 | owner 注销家庭 | `sessions` / `consent_records` / `member_child_bindings` / `child_profiles` / `credit_*` 逐表 `COUNT(*)` 为 0 |
| 35 | 日志脱敏 | 抽检 `audit_logs` 与云函数日志 | 无 Token / PIN / 密钥 / 儿童内容明文 |

---

## 7. 安全与编码约束

| 项 | 要求 |
| --- | --- |
| 身份 | 只使用 `cloud.getWXContext().OPENID / UNIONID`；禁止信任 `event.openid`、`event.userInfo` 作为身份 |
| SQL | 全参数化查询；`ORDER BY` / 排序列白名单化；禁止字符串拼接（含 `scopeFilter` 的 `IN` 列表用占位符展开） |
| 密钥 | JWT 密钥、MySQL 连接、AI 与支付签名全部环境变量注入；小程序端不含任何密钥；只用 `@cloudbase/js-sdk` v3 |
| 凭证 | 家庭码 / 邀请码 / refresh token 用密码学安全随机数；PIN 加盐不可逆哈希；邀请码只存哈希 |
| 限流 | 云数据库计数（云函数多实例，禁止进程内存）；登录、PIN、家庭码解析、邀请码兑付分别限流；全局 / 家庭 / 成员 / IP 四级 |
| 日志 | 统一响应不返回堆栈；`audit_logs` 不记儿童内容明文；日志脱敏 Token / PIN / 密钥 / 姓名 |
| 儿童 | 创建孩子档案前须监护人单独同意并写 `consent_records`；孩子微信绑定另取单独同意；孩子端无钱包与付费入口 |
| 编码 | TypeScript 严格模式；4 空格缩进、禁止 Tab；import 按 `import-x/order` 分组排序；不使用 `eslint-disable`；不使用已废弃 API；新增源码补模块级中文文档注释 |
| 测试 | 第 6 节 35 项用例纳入 CI 门禁，每项单独列出通过 / 失败；与账本设计 18 项用例一并回归 |

## 8. 演进路径与开放问题

| 议题 | V1 结论 | 后续演进 |
| --- | --- | --- |
| 一个微信身份多家庭 | 不支持，`openid` 唯一 | M5 引入 `family_members` 多对多关联表，令牌携带 `activeFamilyId` 并强制切换校验 |
| 孩子独立微信登录 | 可选方案 B，须监护人单独同意 | 按年龄门槛与合规评估决定是否默认开放 |
| 组织 / 团队 / 教师 | `teacher` 角色预留，V1 不签发 | M5+ 增 `organizations` / `classes` / 席位，教师只读班级汇总 |
| 成长积分与消费积分 | 账本、表、接口、UI 全隔离 | 永不互通 |
| 数据迁移 | 新项目空库起步，无 v2 / v3 数据迁移 | 如需导入静态语料另立一次性工具 |

**待产品确认**（与方案第 9 章一致）：孩子登录是否只走家庭码 + PIN；是否允许 10 岁以上绑定微信；体验积分与孩子数上限是否从注册即生效；PIN 长度与锁定参数是否调整。

## 9. 与其他设计的对应关系

| 来源 | 条款 | 本文落点 |
| --- | --- | --- |
| 方案 3.1–3.3 | 账号与档案分离、微信登录、RBAC 矩阵 | 第 1、3、4 节 |
| 方案 3.4 | `family_id` + `child_id`、NoSQL 隔离、唯一索引、越权面、缓存键、审计 | 第 2.9、3.4、6.2、7 节 |
| 方案 1.5 | 11 项历史缺陷转为验收约束 | 用例 1/2/20–24/27/33 与第 7 节 |
| 账本设计 3、6 | `getBalance` / `createOrder` 对 child 403、跨家庭伪造 | 用例 7、12、13、19 |
| 隐私政策 B3 / B5 | 监护人单独同意留痕、最小授权、导出删除 | `consent_records`、用例 33/34 |
| 协议文档 B3 | owner 独占付费、child 端零付费入口 | 权限矩阵、用例 12/13 |
