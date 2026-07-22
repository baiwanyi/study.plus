-- ============================================================
-- 学迹Plus 建议数据库索引
-- 基于代码中 WHERE 子句模式推断，在 CloudBase MySQL 控制台执行
-- 注意：InnoDB 单表建议不超过 5-6 个复合索引
-- ============================================================

-- 积分记录表：按用户+时间查询（列表页+月度汇总）
CREATE INDEX idx_point_records_user_created
    ON point_records (user_id, created_at DESC);

-- 积分记录表：按用户+类型+时间查询（stats 汇总）
CREATE INDEX idx_point_records_user_type_created
    ON point_records (user_id, type, created_at DESC);

-- 积分记录表：关联查询（撤销/删除时的条件）
CREATE INDEX idx_point_records_related
    ON point_records (related_id, related_type);

-- 兑换表：按用户+状态+时间查询（列表页+月度汇总）
CREATE INDEX idx_exchanges_user_status_created
    ON exchanges (user_id, status, created_at DESC);

-- 月度汇总表：按用户与月份查询（写入/读取频繁）
CREATE INDEX idx_month_summary_user_month
    ON month_summary (user_id, month);

-- 预支表：按用户+状态查询（风控校验+还款）
CREATE INDEX idx_point_advances_user_status
    ON point_advances (user_id, status);

-- 作业表：按用户+状态+时间查询（列表页）
CREATE INDEX idx_tasks_user_status_created
    ON tasks (user_id, status, created_at DESC);

-- 提交表：按 task_id 查询（详情页）
CREATE INDEX idx_submissions_task
    ON submissions (task_id);

-- AI 评分日志表：按 task_id 查询（评分历史）
CREATE INDEX idx_ai_score_logs_task
    ON ai_score_logs (task_id);

-- AI 用量日志表：按用户+时间查询（配额校验+列表页）
CREATE INDEX idx_ai_usage_logs_user_created
    ON ai_usage_logs (user_id, created_at DESC);

-- AI 用量日志表：按项目分组查询（summary 汇总）
CREATE INDEX idx_ai_usage_logs_project
    ON ai_usage_logs (project);

-- 学习心得表：按用户+时间查询（列表页）
CREATE INDEX idx_studynotes_user_created
    ON studynotes (user_id, created_at DESC);

-- 心得会话表：按心得 ID 查询
CREATE INDEX idx_studynote_conversations_studynote
    ON studynote_conversations (studynote_id);

-- 心得消息表：按会话 ID 查询
CREATE INDEX idx_studynote_messages_conversation
    ON studynote_messages (conversation_id);

-- 周报表：按用户+年份+周数查询（列表页）
CREATE INDEX idx_weekly_reports_user_year
    ON weekly_reports (user_id, year DESC, week_number DESC);

-- 家庭绑定表：按家长 ID 查询
CREATE INDEX idx_family_bindings_parent
    ON family_bindings (parent_id, is_active);

-- 用户表：按 openid 查询（登录）
CREATE INDEX idx_users_openid
    ON users (openid);
