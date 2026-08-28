import { sql } from 'drizzle-orm'
import {
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import {
    defaultGradeValues,
    exchangeStatusValues,
    relatedTypeValues,
    taskStatus,
} from '@shared/utils'

export const tasks = sqliteTable('tasks', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    type: text('type', { enum: ['composition', 'mindmap', 'notes'] }).notNull(),
    status: text('status', { enum: taskStatus }).notNull().default('pending'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const submissions = sqliteTable('submissions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
        .notNull()
        .unique()
        .references(() => tasks.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    grade: text('grade', { enum: defaultGradeValues }),
    aiScore: text('ai_score'),
    scoredAt: text('scored_at'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const pointRecords = sqliteTable('point_records', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['earn', 'deduct'] }).notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    ruleName: text('rule_name'),
    relatedId: integer('related_id'),
    relatedType: text('related_type', {
        enum: relatedTypeValues,
    }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const exchanges = sqliteTable('exchanges', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    itemType: text('item_type').notNull(),
    pointsCost: integer('points_cost').notNull(),
    detail: text('detail').notNull().default(''),
    status: text('status', { enum: exchangeStatusValues })
        .notNull()
        .default('active'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const options = sqliteTable('options', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
})

export const aiScoreLogs = sqliteTable('ai_score_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
        .notNull()
        .references(() => tasks.id, { onDelete: 'cascade' }),
    submissionId: integer('submission_id')
        .notNull()
        .references(() => submissions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    grade: text('grade', { enum: defaultGradeValues }),
    aiScore: text('ai_score').notNull(),
    scoredAt: text('scored_at').notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const aiUsageLogs = sqliteTable('ai_usage_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project: text('project').notNull(),
    taskId: integer('task_id'),
    taskTitle: text('task_title'),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const pointAdvances = sqliteTable('point_advances', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    amount: integer('amount').notNull(),
    totalRepayment: integer('total_repayment').notNull(),
    installments: integer('installments').notNull(),
    installmentAmount: integer('installment_amount').notNull(),
    paidInstallments: integer('paid_installments').notNull().default(0),
    status: text('status', {
        enum: ['active', 'completed'],
    })
        .notNull()
        .default('active'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const monthSummary = sqliteTable('month_summary', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    month: text('month').notNull().unique(),
    basePoints: integer('base_points').notNull().default(500),
    totalEarn: integer('total_earn').notNull().default(0),
    totalDeduct: integer('total_deduct').notNull().default(0),
    totalExchanges: integer('total_exchanges').notNull().default(0),
    balance: integer('balance').notNull().default(500),
})

export const videos = sqliteTable('videos', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    path: text('path').notNull(),
    title: text('title').notNull(),
    md5: text('md5').notNull().unique(),
    views: integer('views').notNull().default(0),
    resumeTime: integer('resume_time').notNull().default(0),
    favorite: integer('favorite').notNull().default(0),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const weeklyReports = sqliteTable(
    'weekly_reports',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        weekNumber: integer('week_number').notNull(),
        year: integer('year').notNull(),
        content: text('content').notNull(),
        analysis: text('analysis'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        weekYearUnique: uniqueIndex('week_year_unique').on(
            table.year,
            table.weekNumber,
        ),
    }),
)

export const weeklyConversations = sqliteTable('weekly_conversations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    weeklyReportId: integer('weekly_report_id')
        .notNull()
        .unique()
        .references(() => weeklyReports.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const taskConversations = sqliteTable('task_conversations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
        .notNull()
        .unique()
        .references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const taskMessages = sqliteTable(
    'task_messages',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        conversationId: integer('conversation_id')
            .notNull()
            .references(() => taskConversations.id, { onDelete: 'cascade' }),
        role: text('role', { enum: ['user', 'assistant'] }).notNull(),
        content: text('content').notNull(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        conversationIdIdx: index('task_messages_conversation_id_idx').on(
            table.conversationId,
        ),
    }),
)

export const studyNotes = sqliteTable('study_notes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    summary: text('summary').notNull(),
    example: text('example').notNull(),
    stuckPoints: text('stuck_points').notNull(),
    memoryHook: text('memory_hook'),
    evaluation: text('evaluation'),
    evaluatedAt: text('evaluated_at'),
    lessonId: integer('lesson_id')
        .notNull()
        .references(() => studyLessons.id, {
            onDelete: 'cascade',
        }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
}, (table) => ({
    lessonIdIdx: index('study_notes_lesson_id_idx').on(table.lessonId),
}))

export const studyLessons = sqliteTable(
    'study_lessons',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        subject: text('subject').notNull(),
        topic: text('topic').notNull(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
        updatedAt: text('updated_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        subjectTopicUnique: uniqueIndex(
            'study_lessons_subject_topic_unique',
        ).on(table.subject, table.topic),
    }),
)

export const studyPreviews = sqliteTable('study_previews', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    lessonId: integer('lesson_id')
        .notNull()
        .unique()
        .references(() => studyLessons.id, { onDelete: 'cascade' }),
    content: text('content').notNull().default(''),
    oldKnowledge: text('old_knowledge').notNull().default(''),
    questions: text('questions').notNull().default(''),
    aiAnalysis: text('ai_analysis'),
    aiAnalyzedAt: text('ai_analyzed_at'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const studyQuiz = sqliteTable(
    'study_quiz',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        studyId: integer('study_id')
            .notNull()
            .references(() => studyLessons.id, { onDelete: 'cascade' }),
        questionsJson: text('questions_json').notNull(),
        answersJson: text('answers_json'),
        resultsJson: text('results_json'),
        score: real('score'),
        correctCount: integer('correct_count'),
        comment: text('comment').notNull().default(''),
        suggestionsJson: text('suggestions_json').notNull().default('[]'),
        generatedAt: text('generated_at').notNull(),
        submittedAt: text('submitted_at'),
        // 未提交测验的剩余秒数快照：弹窗关闭时冻结写入，重开时续算；NULL 表示尚无快照
        remainingSeconds: integer('remaining_seconds'),
        // 绝对截止时刻（Unix 毫秒）：多端共用的倒计时真源，首次开始作答时裁决落库；
        // NULL 表示计时尚未开始（新测验或历史存量数据），前端只读端据此不显示倒计时
        deadlineAt: integer('deadline_at'),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        // 部分唯一索引：同一课程同时最多一套「未提交」测验，保证并发不重复生成；
        // 已提交的历史记录允许保留多套，支持重新生成新题。
        studyIdPendingUnique: uniqueIndex(
            'study_quiz_study_id_pending_unique',
        )
            .on(table.studyId)
            .where(sql`${table.submittedAt} IS NULL`),
    }),
)

export const weeklyMessages = sqliteTable(
    'weekly_messages',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        conversationId: integer('conversation_id')
            .notNull()
            .references(() => weeklyConversations.id, { onDelete: 'cascade' }),
        role: text('role', { enum: ['user', 'assistant'] }).notNull(),
        content: text('content').notNull(),
        createdAt: text('created_at')
            .notNull()
            .$defaultFn(() => new Date().toISOString()),
    },
    (table) => ({
        conversationIdIdx: index('weekly_messages_conversation_id_idx').on(
            table.conversationId,
        ),
    }),
)
