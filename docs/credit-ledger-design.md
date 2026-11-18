# 消费积分账本详细设计

> 本文是 `docs/miniprogram-transformation-plan.md` v2.0 第 4 章的工程落地设计，覆盖数据表 DDL、云函数契约、预扣与结算时序、有效期批次、对账与幂等测试用例。适用于新建的 CloudBase 微信小程序项目（空库起步，无历史数据迁移）。
>
> 核心原则：**积分余额与流水以服务端 MySQL 账本为唯一真实来源**，客户端展示值不参与任何裁决；所有扣分先预扣、后结算，失败全额退回；所有写入幂等。

## 文档控制

| 项 | 内容 |
| --- | --- |
| 文档状态 | 设计稿（待研发评审；价格与比例需产品/财务在 Gate 0 冻结） |
| 版本 | v1.0 |
| 编制日期 | 2026-11-04 |
| 依赖文档 | `docs/miniprogram-transformation-plan.md`（计费模型、套餐与有效期）、`docs/credit-terms.md`（对用户的规则与协议）、`docs/privacy-policy.md`（积分账本的个人信息处理说明） |
| 运行环境 | CloudBase 云函数 Node.js 20 + CloudBase MySQL 8.0 + NoSQL 配置；`@cloudbase/js-sdk` v3 |
| 前置约束 | 积分:人民币兑换比例、补充包面额、AI 价目表 v1 已在 Gate 0 冻结并通过沙箱验证；虚拟支付代币/道具模式已向平台核定 |

---

## 1. 设计边界与术语

| 项 | 结论 |
| --- | --- |
| 账户主体 | **家庭（`family_id`）**，一个家庭一个消费积分账户；与孩子维度的「成长积分」账本（`point_records`）完全隔离，永不换算 |
| 谁可消费 | owner 独占购买与消费管理；parent 只读；**child 不可见钱包、不可读积分接口** |
| 计价单位 | 金额一律用「分」（`amount_fen INT UNSIGNED`）；积分一律用 `BIGINT` 整数点数，**禁止浮点** |
| 唯一真实来源 | `credit_accounts.balance` / `frozen` + `credit_ledger` 只追加流水 |
| 不做什么 | 不建 Web/H5 支付、不迁移 v2 数据、不允许提现/转让/反向兑人民币/兑换成长积分/跨家庭转赠、不用进程内存记账 |

**账务恒等式（日终必须成立）**

```
credit_accounts.balance = 最后一条 credit_ledger.balance_after
credit_accounts.frozen  = 最后一条 credit_ledger.frozen_after
Σ(grant + topup + trial + compensation + refund + adjust)
  - Σ(debit + expire) = credit_accounts.balance
Σ(reserve) - Σ(debit + refund) = credit_accounts.frozen
Σ(credit_batches.remaining_credit WHERE status='active') = credit_accounts.balance
```

---

## 2. 数据表 DDL

> 四张核心表按需求给出；另需两张支撑表（`credit_batches`、`credit_price_list`）——没有批次表无法实现「包月积分 90 天 / 补充包 24 个月 / 结转上限 50%」，没有价目表无法在事务内确定扣分且无法版本化。全部使用参数化查询，禁止 SQL 拼接。

### 2.1 `credit_accounts`（账户余额与乐观锁）

```sql
CREATE TABLE IF NOT EXISTS credit_accounts (
    family_id   BIGINT UNSIGNED NOT NULL COMMENT '家庭ID，账户主体',
    balance     BIGINT NOT NULL DEFAULT 0 COMMENT '可用积分',
    frozen      BIGINT NOT NULL DEFAULT 0 COMMENT '预扣冻结中积分',
    version     BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'CAS 版本号',
    status      ENUM('active','frozen','closed') NOT NULL DEFAULT 'active',
    created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (family_id),
    CONSTRAINT ck_account_nonnegative CHECK (balance >= 0 AND frozen >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消费积分账户';
```

### 2.2 `credit_ledger`（只追加流水）

```sql
CREATE TABLE IF NOT EXISTS credit_ledger (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id           BIGINT UNSIGNED NOT NULL,
    direction           ENUM('grant','topup','trial','compensation','reserve','debit','refund','expire','adjust') NOT NULL,
    amount              BIGINT NOT NULL COMMENT '正数，方向由 direction 决定',
    balance_after       BIGINT NOT NULL COMMENT '本条流水后的可用余额快照',
    frozen_after        BIGINT NOT NULL DEFAULT 0 COMMENT '本条流水后的冻结额快照',
    biz_type            VARCHAR(32) NOT NULL COMMENT 'subscription_grant/topup/ai_score/ai_quiz/...',
    biz_id              VARCHAR(128) NOT NULL DEFAULT '' COMMENT '业务对象ID（作业/测验/订单号）',
    idempotency_key     VARCHAR(191) NOT NULL COMMENT '全局幂等键',
    platform            VARCHAR(16) NOT NULL DEFAULT '' COMMENT 'android/ios/windows/harmony/空',
    price_list_version  VARCHAR(32) NOT NULL DEFAULT '' COMMENT '扣分时的价目表版本',
    batch_id            BIGINT UNSIGNED DEFAULT NULL COMMENT '关联的积分批次',
    expires_at          DATETIME(3) DEFAULT NULL COMMENT '该笔发放的过期时间',
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_ledger_idem (idempotency_key),
    KEY idx_ledger_family_time (family_id, created_at),
    KEY idx_ledger_biz (biz_type, biz_id),
    KEY idx_ledger_family_dir (family_id, direction, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消费积分流水（只追加，不UPDATE/DELETE）';
```

**约束**：该表只允许 `INSERT`；任何补偿、撤销、过期都以一条反向 `direction` 流水表达，不修改历史行。`idempotency_key` 是幂等的唯一技术保证。

### 2.3 `subscriptions`（订阅状态机）

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id               BIGINT UNSIGNED NOT NULL,
    plan_code               VARCHAR(32) NOT NULL COMMENT 'basic_month/standard_month/advanced_month/年付档',
    status                  ENUM('pending','active','grace','expired','cancelled','refunded') NOT NULL DEFAULT 'pending',
    period_start            DATETIME(3) NOT NULL,
    period_end              DATETIME(3) NOT NULL,
    last_granted_period     VARCHAR(16) NOT NULL DEFAULT '' COMMENT '已发放周期 YYYY-MM，月度发放幂等',
    auto_renew              TINYINT(1) NOT NULL DEFAULT 1,
    platform                VARCHAR(16) NOT NULL DEFAULT '',
    original_transaction_id VARCHAR(128) DEFAULT NULL COMMENT 'iOS 订阅签约标识',
    credit_per_period       BIGINT NOT NULL DEFAULT 0 COMMENT '每期发放积分数（下单时快照）',
    created_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_sub_txn (platform, original_transaction_id),
    UNIQUE KEY uk_sub_plan_period (family_id, plan_code, period_start),
    KEY idx_sub_family_status (family_id, status),
    KEY idx_sub_period_end (status, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='包月订阅';
```

**状态流转**：`pending → active →（active 续期）→ grace → expired`；解约 `cancelled`；退款 `refunded`。`credit_per_period` 必须**下单时快照**，避免后续套餐调价影响已签约订单。

### 2.4 `orders`（订单与发货幂等）

```sql
CREATE TABLE IF NOT EXISTS orders (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_no            VARCHAR(64) NOT NULL COMMENT '我方订单号',
    family_id           BIGINT UNSIGNED NOT NULL,
    order_type          ENUM('subscription','topup') NOT NULL,
    sku_code            VARCHAR(32) NOT NULL COMMENT '套餐或补充包面额编码',
    amount_fen          INT UNSIGNED NOT NULL COMMENT '金额（分）',
    credit_amount       BIGINT NOT NULL DEFAULT 0 COMMENT '补充包面额/订阅当期额度',
    status              ENUM('created','paid','delivered','failed','refunded','closed') NOT NULL DEFAULT 'created',
    platform            VARCHAR(16) NOT NULL DEFAULT '',
    platform_order_no   VARCHAR(128) DEFAULT NULL,
    idempotency_key     VARCHAR(191) NOT NULL,
    delivered_at        DATETIME(3) DEFAULT NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    UNIQUE KEY uk_order_idem (idempotency_key),
    UNIQUE KEY uk_platform_order (platform, platform_order_no),
    KEY idx_order_family_time (family_id, created_at),
    KEY idx_order_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订阅与补充包订单';
```

**状态流转**：`created → paid → delivered`；支付失败 `failed`；退款 `refunded`；超时未支付 `closed`。**发货只认平台服务端通知**，前端 `success` 不触发状态变更。

### 2.5 `credit_batches`（有效期批次，支撑表）

```sql
CREATE TABLE IF NOT EXISTS credit_batches (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    family_id         BIGINT UNSIGNED NOT NULL,
    source            ENUM('subscription_grant','topup','trial','compensation') NOT NULL,
    source_ledger_id  BIGINT UNSIGNED NOT NULL,
    total_credit      BIGINT NOT NULL,
    remaining_credit  BIGINT NOT NULL,
    expires_at        DATETIME(3) NOT NULL,
    status            ENUM('active','exhausted','expired') NOT NULL DEFAULT 'active',
    created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_batch_consume (family_id, status, expires_at, id),
    CONSTRAINT ck_batch_nonnegative CHECK (remaining_credit >= 0 AND remaining_credit <= total_credit)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='积分批次（FIFO 消费）';
```

**消费顺序**：`ORDER BY expires_at ASC, id ASC`（先到期先扣）。包月发放批次的 `expires_at` 按方案 4.7 规则计算（当期最长 90 天，结转部分并入新批次且不超过当期配额 50%）；补充包 24 个月；体验赠送 30 天。

### 2.6 `credit_price_list`（扣分价目表，支撑表）

```sql
CREATE TABLE IF NOT EXISTS credit_price_list (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    version         VARCHAR(32) NOT NULL,
    action_code     VARCHAR(64) NOT NULL COMMENT 'ai_score/ai_quiz/weekly_analyze/...',
    credit_cost     BIGINT NOT NULL,
    effective_from  DATETIME(3) NOT NULL,
    announced_at    DATETIME(3) NOT NULL COMMENT '公告时间，须提前7天',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_price_version_action (version, action_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 扣分价目表（版本化，只追加）';
```

**规则**：只追加新版本，不改旧行；调用时取 `effective_from <= now` 的最新版本并写入流水 `price_list_version`；变更仅对变更后的新调用生效，不追溯。

---

## 3. 云函数契约

统一响应沿用 `common/entry.ts`：`{ code, error, message, data }`；`familyId`、`role` 一律由 `getAuthContext()` 从令牌与云上下文注入，**不接受客户端传入**。

| 云函数 | action | 关键入参 | 出参 | 主要错误 |
| --- | --- | --- | --- | --- |
| `entitlement` | `reserve` | `actionCode`, `requestId` | `reservationId`, `reservedAmount`, `priceVersion`, `balance` | 402 余额不足 / 409 重复请求 / 403 无权限 / 429 限流 |
| `entitlement` | `settle` | `reservationId` | `balance` | 409 状态不符 |
| `entitlement` | `refund` | `reservationId`, `reason` | `balance` | 409 重复退回 |
| `credit` | `getBalance` | — | `balance`, `frozen`, `batches` | 403 child 禁止 |
| `credit` | `listLedger` | `cursor`, `limit` | `items`, `nextCursor` | 403 child 禁止 |
| `billing` | `createOrder` | `orderType`, `skuCode` | `orderNo`, `payParams` | 409 重复下单 |
| `billing` | `notify` | 平台发货通知（验签） | `ack` | 验签失败直接拒绝 |
| `billing` | `queryAndDeliver` | `orderNo` | `status` | — |
| `billing` | `grantMonthly` | `familyId`, `period` | `grantedAmount` | 幂等，重跑不重复 |
| `credit` | `expireBatches` | 定时触发 | `expiredAmount` | 幂等 |

**权限矩阵**：`getBalance` / `listLedger` 仅 owner、parent（只读）；`createOrder` / 所有购买入口仅 owner；`reserve` 允许 owner / parent / child 发起 AI 调用，但**扣的是家庭账户**，且孩子端不展示余额（前端不调用 `getBalance`）。

---

## 4. 预扣与结算时序

### 4.1 标准流程

```
客户端发起 AI 能力（actionCode + requestId）
   │
   ▼
[entitlement.reserve]  ── 事务 T1 ──────────────────────────────┐
   1. 读最新 credit_price_list → creditCost, priceVersion        │
   2. CAS 扣减：                                                  │
      UPDATE credit_accounts                                     │
         SET balance = balance - ?, frozen = frozen + ?,         │
             version = version + 1                               │
       WHERE family_id = ? AND status='active'                   │
         AND balance >= ? AND version = ?                        │
   3. 影响行数 0 → 返回 402（余额不足）或重试 2~3 次（版本冲突）  │
   4. FIFO 占用 credit_batches（先到期先扣，逐批 CAS）             │
   5. INSERT credit_ledger(direction='reserve',                  │
        idempotency_key='reserve:<familyId>:<requestId>')         │
   6. 提交，返回 reservationId                                    │
   └────────────────────────────────────────────────────────────┘
   │
   ▼
调用 CloudBase AI（事务外，避免长事务；超时 120s 截断、单次 Token 上限）
   │
   ├─ 成功 ─▶ [entitlement.settle] 事务 T2：
   │            UPDATE credit_accounts SET frozen = frozen - ?, version = version + 1
   │              WHERE family_id = ? AND frozen >= ?
   │            INSERT credit_ledger(direction='debit',
   │              idempotency_key='debit:<reservationId>')
   │            写 ai_usage_logs（含 priceVersion / Token 用量）
   │
   └─ 失败 / 超时 / 内容安全拦截 ─▶ [entitlement.refund] 事务 T3：
                UPDATE credit_accounts
                   SET balance = balance + ?, frozen = frozen - ?, version = version + 1
                 WHERE family_id = ? AND frozen >= ?
                回补 credit_batches.remaining_credit
                INSERT credit_ledger(direction='refund',
                  idempotency_key='refund:<reservationId>')
```

### 4.2 补偿任务

| 任务 | 触发 | 逻辑 | 幂等 |
| --- | --- | --- | --- |
| 冻结超时退回 | 每 5 分钟 | 扫描 `direction='reserve'` 且超过 10 分钟无配对 `debit`/`refund` 的流水 → 按 `refund:<reservationId>` 退回 | 唯一键保证 |
| 订单补发货 | 每 10 分钟 | 扫描 `orders.status='paid'` 且未 `delivered` → 主动查平台订单 → 确认后发货 | `deliver:<orderNo>` |
| 月度发放 | 每日 0 点 + 周期内重跑 | 对 `subscriptions.status IN ('active','grace')` 且 `last_granted_period != 当前周期` 发放 | `grant:<familyId>:<planCode>:<period>` |
| 批次过期 | 每日 1 点 | 扫描 `credit_batches.status='active' AND expires_at <= now` → 按剩余量写 `expire` 流水并置 `expired` | `expire:<batchId>` |
| 结转处理 | 月度发放时 | 上期未消耗积分按「不超过当期配额 50%」并入新批次，超出部分写 `expire` | 同发放幂等键 |
| 日终对账 | 每日 2 点 | 校验第 1 节四条恒等式；差异告警并冻结该家庭 AI 能力 | 只读 + 告警 |

### 4.3 发货时序（包月 / 补充包）

```
下单 createOrder（幂等键 order:<familyId>:<sku>:<nonce>）
   → 平台支付 → 平台发货通知 billing.notify（验签）
   → 事务：orders.status='delivered'
           + INSERT credit_ledger(direction='grant'|'topup', idempotency_key='deliver:<orderNo>')
           + INSERT credit_batches（含 expires_at）
           + UPDATE credit_accounts（balance 增加、version+1）
           + subscriptions 状态/周期更新（仅包月）
   → 返回 ack
兜底：queryAndDeliver 定时查单补发；重复通知命中唯一键直接返回成功
```

**关键**：所有发货写入在**同一个 MySQL 事务**内；重复通知、查单补发与定时任务并发到达时，由 `uk_order_no` / `uk_ledger_idem` 保证只生效一次。

---

## 5. 幂等键清单

| 场景 | 幂等键格式 | 唯一约束位置 |
| --- | --- | --- |
| 创建订单 | `order:<familyId>:<skuCode>:<nonce>` | `orders.uk_order_idem` |
| 平台发货（补充包/包月） | `deliver:<orderNo>` | `credit_ledger.uk_ledger_idem` |
| 平台订单去重 | `(platform, platform_order_no)` | `orders.uk_platform_order` |
| iOS 签约去重 | `(platform, original_transaction_id)` | `subscriptions.uk_sub_txn` |
| 月度发放 | `grant:<familyId>:<planCode>:<YYYY-MM>` | `credit_ledger.uk_ledger_idem` |
| AI 预扣 | `reserve:<familyId>:<requestId>` | `credit_ledger.uk_ledger_idem` |
| AI 结算 | `debit:<reservationId>` | 同上 |
| AI 退回 | `refund:<reservationId>` | 同上 |
| 批次过期 | `expire:<batchId>` | 同上 |
| 人工调账 | `adjust:<ticketNo>` | 同上 |

`requestId` 由客户端在**发起 AI 调用前**生成并在重试时保持不变；服务端不信任客户端传的 `familyId`、`amount`、`priceVersion`。

---

## 6. 幂等与账务测试用例

> 以下为 CI 门禁用例，每项须单独列出通过 / 失败，不接受「全部通过」的汇总结论。

| # | 场景 | 前置 | 步骤 | 预期结果 |
| --- | --- | --- | --- | --- |
| 1 | 重复发货通知 | 补充包订单已 `created` | 同一 `orderNo` 的发货通知连续投递 5 次（含并发） | 仅 1 条 `topup` 流水；`orders` 状态 `delivered`；积分只增加一次 |
| 2 | 前端重复点击购买 | 无 | 同一 `nonce` 连续调用 `createOrder` 3 次 | 仅生成 1 笔订单；其余命中 `uk_order_idem` 返回同一 `orderNo` |
| 3 | 相同 AI 请求重试 | 余额 100 点，评分 2 点 | 同一 `requestId` 连续 `reserve` 5 次 | 仅 1 条 `reserve` 流水；余额 98、`frozen` 2；后续请求返回同一 `reservationId` |
| 4 | 并发扣减不超卖 | 余额仅够 3 次调用 | 10 个不同 `requestId` 并发 `reserve` | 恰好 3 成功 7 返回 402；`balance=0`；无负数；`version` 递增 3 次 |
| 5 | AI 调用失败退回 | 已 `reserve` 2 点 | 模型返回错误 → `refund` | `balance` 回补 2、`frozen=0`；1 条 `refund` 流水；批次剩余量回补 |
| 6 | 超时截断退回 | 已 `reserve` | 模型超过 120s | 同用例 5，且 `ai_usage_logs` 记录超时原因 |
| 7 | 云函数崩溃补偿 | `reserve` 后进程退出，无 `settle`/`refund` | 触发冻结超时任务 | 10 分钟后自动退回；重跑补偿任务不重复退回 |
| 8 | 月度发放重跑 | 订阅 `active`，当期未发放 | `grantMonthly` 连续执行 3 次 | 仅 1 条 `grant` 流水；`last_granted_period` 更新一次 |
| 9 | 回调与查单同时到达 | 订单 `paid` 未发货 | `notify` 与 `queryAndDeliver` 并发 | 仅一次发货；另一侧命中唯一键后返回成功，不重复加积分 |
| 10 | 结转上限 | 上期剩余 400 点，当期配额 300 点 | 触发新一期发放 | 结转 150 点（配额 50%），其余 250 点写 `expire`；总余额 450 |
| 11 | 批次过期只清未消耗 | 批次剩 60 点、已消耗 40 点 | 到达 `expires_at` 触发过期任务 | 仅 60 点过期；`expire` 流水幂等；重跑无变化 |
| 12 | 订阅退款回收 | 订阅当期发放 300 点，已消耗 80 点 | 平台退款回调 | 回收未消耗 220 点（按协议折算）；已消耗不追补；不产生负余额；订阅 `refunded` |
| 13 | 补充包到期不清零 | 补充包 500 点未用，订阅已退订 | 订阅到期 | 500 点仍在 `active` 批次且 24 个月内可用；仅订阅专属权益回收 |
| 14 | 价目表版本变更 | 价目表 v1 评分 2 点，v2 改 3 点 | 变更前后各发起一次评分 | 旧调用按 v1 扣 2 点；新调用按 v2 扣 3 点；流水 `price_list_version` 正确；不追溯 |
| 15 | 跨家庭伪造 | 家庭 A 有余额 | 客户端伪造 `familyId=B` 调 `reserve` / `getBalance` | `familyId` 由令牌注入，伪造值被忽略；跨家庭读返回 404；账务无变化 |
| 16 | child 越权 | child 账号登录 | 调 `getBalance` / `createOrder` | 均返回 403；页面无钱包与购买入口 |
| 17 | 重复 settle / refund | 已 `settle` | 再次 `settle` 或 `refund` | 返回 409；余额不变，无重复流水 |
| 18 | 日终对账 | 执行完上述全部用例 | 触发对账任务 | 四条恒等式全部成立；差异为 0；对账报告可导出 |

---

## 7. 安全、监控与运维

| 项 | 要求 |
| --- | --- |
| 权限 | 所有积分接口经 `getAuthContext` + `assertRole`；`familyId` 服务端注入；child 不读余额；owner 独占购买 |
| SQL | 全参数化查询；禁止任何字符串拼接（含 `ORDER BY` 白名单化）；价目表与批次表在同一库以保证事务一致 |
| 密钥 | MySQL / AI / 支付签名密钥全部环境变量注入；小程序端不含任何密钥；`@cloudbase/js-sdk` v3 |
| 限流 | 云数据库计数（云函数多实例）；全局 / 家庭 / 成员 / IP 四级；AI、下单、发货回调分别限流 |
| 日志 | 脱敏 Token / Key / 儿童内容；记录 `priceVersion`、`idempotency_key`、`reservationId`、耗时与 Token 用量 |
| 监控 | 余额与消耗速率、`frozen` 滞留量、`Σ流水 = 余额` 差异、AI 成本/收入、预算熔断、异常突增 Top 10 |
| 告警 | 对账差异、冻结超时 > 阈值、发货积压、重复通知突增、单家庭消耗异常 → 自动降级 + 人工复核 |
| 变更 | 兑换比例与补充包面额**发布后不可修改**；调价只动套餐价/首发价，价目表按版本追加并提前 7 天公告 |
| 回滚 | 新建项目空库起步，无历史数据迁移；发版保留上一版云函数与 DDL 基线脚本；账务异常以补偿流水修正，禁止直接改流水 |

## 8. 与设计决策的对应关系

| 方案条款 | 本设计落点 |
| --- | --- |
| 4.2 积分即通行证、归属家庭 | `credit_accounts.family_id` 主键；权限矩阵 |
| 4.3 包月三档 / 补充包三档 | `subscriptions.plan_code`、`orders.sku_code`、`credit_per_period` 快照 |
| 4.4 价目表可配、变更需公告 | `credit_price_list` 版本化 + 流水记录 `price_list_version` |
| 4.5 CAS 预扣、幂等、日终对账 | 第 4 节时序、第 5 节幂等键、第 1 节恒等式 |
| 4.6 发货回调 + 查单双通道 | `billing.notify` + `queryAndDeliver` + `deliver:<orderNo>` |
| 4.7 有效期、结转、到期不清零 | `credit_batches` + 过期/结转任务 |
| 4.8 退款折算、不产生负余额 | 用例 12、`ck_account_nonnegative` |
| 2.4 两套积分隔离 | 独立表 `credit_*` vs `point_records`；child 不可见钱包 |
