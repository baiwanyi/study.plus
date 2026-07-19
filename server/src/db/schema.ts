import {
    integer,
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

export const weeklyReports = sqliteTable('weekly_reports', {
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
}, (table) => ({
    weekYearUnique: uniqueIndex('week_year_unique').on(table.year, table.weekNumber),
}))

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

export const taskMessages = sqliteTable('task_messages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
        .notNull()
        .references(() => taskConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const studynotes = sqliteTable('studynotes', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subject: text('subject').notNull(),
    topic: text('topic').notNull().default(''),
    summary: text('summary').notNull(),
    example: text('example').notNull(),
    stuckPoints: text('stuck_points').notNull(),
    memoryHook: text('memory_hook'),
    evaluation: text('evaluation'),
    evaluatedAt: text('evaluated_at'),
    followUpScore: integer('follow_up_score'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const studynoteConversations = sqliteTable('studynote_conversations', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    studynoteId: integer('studynote_id')
        .notNull()
        .unique()
        .references(() => studynotes.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
    updatedAt: text('updated_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const studynoteMessages = sqliteTable('studynote_messages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
        .notNull()
        .references(() => studynoteConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const weeklyMessages = sqliteTable('weekly_messages', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
        .notNull()
        .references(() => weeklyConversations.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})
