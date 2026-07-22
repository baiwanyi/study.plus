-- 学迹Plus MySQL 数据库结构（CloudBase MySQL）
-- 全部业务表均含 user_id 字段，用于多用户（家长/孩子）数据隔离。
-- options 配置类数据存放于 CloudBase NoSQL（集合名 options），不在此建表。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===================== 用户与家庭体系 =====================
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(64) NOT NULL UNIQUE,
    nickname VARCHAR(64) DEFAULT '',
    avatar VARCHAR(256) DEFAULT '',
    role ENUM('parent', 'child') NOT NULL DEFAULT 'child',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    privacy_agreed TINYINT(1) NOT NULL DEFAULT 0,
    privacy_version VARCHAR(32) DEFAULT '',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS family_bindings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    parent_id INT NOT NULL,
    child_id INT NOT NULL,
    nickname VARCHAR(64) DEFAULT '',
    grade VARCHAR(16) DEFAULT '未定级',
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_binding_parent FOREIGN KEY (parent_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_binding_child FOREIGN KEY (child_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE KEY uk_parent_child (parent_id, child_id),
    INDEX idx_binding_child (child_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS login_tokens (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token VARCHAR(512) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_token_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    INDEX idx_token (token(255)),
    INDEX idx_token_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== 作业 =====================
CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    type ENUM('composition', 'mindmap', 'notes') NOT NULL,
    status ENUM('pending', 'completed', 'expired') NOT NULL DEFAULT 'pending',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_tasks_user (user_id),
    INDEX idx_tasks_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS submissions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    grade ENUM('A+','A','B','C','D','E') DEFAULT NULL,
    ai_score TEXT DEFAULT NULL,
    scored_at DATETIME(3) DEFAULT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sub_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    UNIQUE KEY uk_sub_task (task_id),
    INDEX idx_sub_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_taskconv_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    UNIQUE KEY uk_taskconv_task (task_id),
    INDEX idx_taskconv_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_taskmsg_conv FOREIGN KEY (conversation_id) REFERENCES task_conversations (id) ON DELETE CASCADE,
    INDEX idx_taskmsg_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== 积分 =====================
CREATE TABLE IF NOT EXISTS point_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    type ENUM('earn', 'deduct') NOT NULL,
    amount INT NOT NULL,
    reason VARCHAR(255) NOT NULL,
    rule_name VARCHAR(128) DEFAULT NULL,
    related_id INT DEFAULT NULL,
    related_type ENUM('task','submission','exam','extra','custom','exchange','revoked','advance') DEFAULT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_pr_user (user_id),
    INDEX idx_pr_user_type (user_id, type),
    INDEX idx_pr_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exchanges (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    item_type VARCHAR(64) NOT NULL,
    points_cost INT NOT NULL,
    detail VARCHAR(512) DEFAULT '',
    status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_ex_user (user_id),
    INDEX idx_ex_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS point_advances (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    total_repayment INT NOT NULL,
    installments INT NOT NULL,
    installment_amount INT NOT NULL,
    paid_installments INT NOT NULL DEFAULT 0,
    status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_adv_user (user_id),
    INDEX idx_adv_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS month_summary (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    month VARCHAR(7) NOT NULL,
    base_points INT NOT NULL DEFAULT 500,
    total_earn INT NOT NULL DEFAULT 0,
    total_deduct INT NOT NULL DEFAULT 0,
    total_exchanges INT NOT NULL DEFAULT 0,
    balance INT NOT NULL DEFAULT 500,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_summary_user_month (user_id, month),
    INDEX idx_summary_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== AI 记录 =====================
CREATE TABLE IF NOT EXISTS ai_score_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_id INT NOT NULL,
    submission_id INT NOT NULL,
    user_id INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    grade ENUM('A+','A','B','C','D','E') DEFAULT NULL,
    ai_score TEXT NOT NULL,
    scored_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_aiscore_task FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
    CONSTRAINT fk_aiscore_sub FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE,
    INDEX idx_aiscore_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ai_usage_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    project VARCHAR(64) NOT NULL,
    task_id INT DEFAULT NULL,
    task_title VARCHAR(255) DEFAULT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    total_tokens INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_aiuse_user (user_id),
    INDEX idx_aiuse_project (project)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== 周报 =====================
CREATE TABLE IF NOT EXISTS weekly_reports (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    week_number INT NOT NULL,
    year INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    analysis TEXT DEFAULT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_week_user (user_id, year, week_number),
    INDEX idx_week_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weekly_conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    weekly_report_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_weekconv_report FOREIGN KEY (weekly_report_id) REFERENCES weekly_reports (id) ON DELETE CASCADE,
    UNIQUE KEY uk_weekconv_report (weekly_report_id),
    INDEX idx_weekconv_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS weekly_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_weekmsg_conv FOREIGN KEY (conversation_id) REFERENCES weekly_conversations (id) ON DELETE CASCADE,
    INDEX idx_weekmsg_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===================== 学习心得（费曼） =====================
CREATE TABLE IF NOT EXISTS studynotes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    subject VARCHAR(32) NOT NULL,
    topic VARCHAR(255) NOT NULL DEFAULT '',
    summary MEDIUMTEXT NOT NULL,
    example MEDIUMTEXT NOT NULL,
    stuck_points MEDIUMTEXT NOT NULL,
    memory_hook MEDIUMTEXT DEFAULT NULL,
    evaluation MEDIUMTEXT DEFAULT NULL,
    evaluated_at DATETIME(3) DEFAULT NULL,
    follow_up_score INT DEFAULT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_notes_user (user_id),
    INDEX idx_notes_user_subject (user_id, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS studynote_conversations (
    id INT PRIMARY KEY AUTO_INCREMENT,
    studynote_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_noteconv_note FOREIGN KEY (studynote_id) REFERENCES studynotes (id) ON DELETE CASCADE,
    UNIQUE KEY uk_noteconv_note (studynote_id),
    INDEX idx_noteconv_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS studynote_messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content MEDIUMTEXT NOT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_notemsg_conv FOREIGN KEY (conversation_id) REFERENCES studynote_conversations (id) ON DELETE CASCADE,
    INDEX idx_notemsg_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
