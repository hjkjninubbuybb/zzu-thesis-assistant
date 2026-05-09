-- RAG 1.0 数据库初始化脚本
-- MySQL 8.0+, utf8mb4

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- ── 用户表 ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(32)  NOT NULL UNIQUE                   COMMENT '登录用户名',
    hashed_pwd   VARCHAR(255) NOT NULL                          COMMENT 'bcrypt 哈希密码',
    display_name VARCHAR(64)  NOT NULL DEFAULT ''               COMMENT '显示名称',
    role         ENUM('admin','teacher','student') NOT NULL DEFAULT 'student' COMMENT '角色',
    is_active    TINYINT(1)   NOT NULL DEFAULT 1                COMMENT '是否启用',
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户账号表';


-- ── 学生扩展档案 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id    BIGINT UNSIGNED PRIMARY KEY              COMMENT '关联 users.id',
    student_id VARCHAR(20)  NOT NULL UNIQUE             COMMENT '学号',
    grade      VARCHAR(10)  NOT NULL DEFAULT ''         COMMENT '年级，如 2022',
    major      VARCHAR(64)  NOT NULL DEFAULT ''         COMMENT '专业',
    class_name VARCHAR(32)  NOT NULL DEFAULT ''         COMMENT '班级',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='学生档案表';


-- ── 教师扩展档案 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS teacher_profiles (
    user_id     BIGINT UNSIGNED PRIMARY KEY             COMMENT '关联 users.id',
    employee_id VARCHAR(20)  NOT NULL UNIQUE            COMMENT '工号',
    department  VARCHAR(64)  NOT NULL DEFAULT ''        COMMENT '院系',
    title       VARCHAR(32)  NOT NULL DEFAULT ''        COMMENT '职称',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='教师档案表';


-- ── 登录日志（按月分区）────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_login_logs (
    id         BIGINT UNSIGNED AUTO_INCREMENT,
    user_id    BIGINT UNSIGNED NOT NULL                 COMMENT '关联 users.id',
    ip_addr    VARCHAR(45)  NOT NULL DEFAULT ''         COMMENT '客户端 IP',
    user_agent VARCHAR(255) NOT NULL DEFAULT ''         COMMENT 'User-Agent',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at),
    INDEX idx_user (user_id),
    INDEX idx_time (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录日志表'
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p202604 VALUES LESS THAN (TO_DAYS('2026-05-01')),
    PARTITION p202605 VALUES LESS THAN (TO_DAYS('2026-06-01')),
    PARTITION p202606 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p202607 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION p202608 VALUES LESS THAN (TO_DAYS('2026-09-01')),
    PARTITION pmax    VALUES LESS THAN MAXVALUE
);


-- ── 知识库 ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE            COMMENT '知识库唯一名称',
    description TEXT                                    COMMENT '描述',
    owner_id    BIGINT UNSIGNED DEFAULT NULL            COMMENT '创建者 user_id（teacher/admin）',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_owner (owner_id),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='知识库表';


-- ── 文档 ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS documents (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kb_name     VARCHAR(100) NOT NULL                   COMMENT '所属知识库名',
    file_name   VARCHAR(255) NOT NULL                   COMMENT '文件名',
    file_size   INT UNSIGNED NOT NULL DEFAULT 0         COMMENT '文件字节数',
    chunk_count INT UNSIGNED NOT NULL DEFAULT 0         COMMENT '切块数量',
    chunk_size  INT UNSIGNED NOT NULL DEFAULT 256       COMMENT '切块大小',
    doc_type    VARCHAR(20)  NOT NULL DEFAULT 'plain_text' COMMENT '文档类型',
    status      VARCHAR(20)  NOT NULL DEFAULT 'processing' COMMENT '处理状态',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_kb (kb_name),
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文档表';


-- ── FAQ ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS faqs (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kb_name    VARCHAR(100) NOT NULL                    COMMENT '所属知识库',
    question   TEXT         NOT NULL                    COMMENT '问题',  -- TEXT 列不支持 DEFAULT，用 NOT NULL 约束
    answer     TEXT         NOT NULL                    COMMENT '答案',
    category   VARCHAR(64)  NOT NULL DEFAULT ''         COMMENT '分类',
    sort_order INT          NOT NULL DEFAULT 0          COMMENT '排序',
    enabled    TINYINT(1)   NOT NULL DEFAULT 1          COMMENT '是否启用',
    vector_id  VARCHAR(64)  DEFAULT NULL                COMMENT 'Qdrant 向量ID',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_kb (kb_name),
    INDEX idx_category (kb_name, category),
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FAQ表';


-- ── 师生关系表 ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mentor_student_relations (
    mentor_id  BIGINT UNSIGNED NOT NULL,
    student_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (mentor_id, student_id),
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='师生关系映射表';


-- ── 导师答疑请求 ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qa_requests (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    student_id      BIGINT UNSIGNED NOT NULL              COMMENT '发起学生',
    mentor_id       BIGINT UNSIGNED NOT NULL              COMMENT '指派导师',
    conversation_id BIGINT UNSIGNED NOT NULL              COMMENT '源对话',
    message_id      BIGINT UNSIGNED NOT NULL              COMMENT '源消息（学生的问题）',
    question        TEXT            NOT NULL              COMMENT '问题副本',
    answer          TEXT            DEFAULT NULL          COMMENT '人工回复内容',
    status          ENUM('pending','replied','closed') NOT NULL DEFAULT 'pending' COMMENT '状态',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    replied_at      DATETIME        DEFAULT NULL,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='导师答疑请求表';


-- ── FAQ 增加审核状态 ──────────────────────────────────────────

ALTER TABLE faqs ADD COLUMN author_id BIGINT UNSIGNED DEFAULT NULL COMMENT '提报人';
ALTER TABLE faqs ADD COLUMN status ENUM('draft', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved' COMMENT '审核状态';
ALTER TABLE faqs ADD CONSTRAINT fk_faq_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;


-- ── 系统设置 ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
    `key`  VARCHAR(100) PRIMARY KEY                    COMMENT '设置键',
    value  TEXT         NOT NULL                       COMMENT '设置值'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统设置表';


-- ── 对话 ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    BIGINT UNSIGNED NOT NULL                 COMMENT '发起对话的用户',
    kb_name    VARCHAR(100) NOT NULL                    COMMENT '使用的知识库',
    title      VARCHAR(200) NOT NULL DEFAULT '新对话'  COMMENT '对话标题',
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_user_kb (user_id, kb_name),
    INDEX idx_updated (updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (kb_name) REFERENCES knowledge_bases(name) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='对话表';


-- ── 消息 ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversation_messages (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT UNSIGNED NOT NULL              COMMENT '所属对话',
    role            ENUM('user','assistant') NOT NULL     COMMENT '消息角色',
    content         TEXT            NOT NULL              COMMENT '消息内容',
    sources         JSON            DEFAULT NULL          COMMENT '引用来源（JSON数组）',
    files           JSON            DEFAULT NULL          COMMENT '附件（JSON数组）',
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_conv (conversation_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息表';


-- ── 消息反馈 ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS message_feedback (
    id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT UNSIGNED NOT NULL UNIQUE            COMMENT '关联消息',
    rating     ENUM('up','down') NOT NULL                 COMMENT '评分',
    created_at DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES conversation_messages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消息反馈表';
