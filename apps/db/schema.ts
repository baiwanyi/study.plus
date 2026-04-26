import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import {
    defaultGradeValues,
    taskTypeValues,
    taskStatus,
    relatedTypeValues,
    exchangeStatusValues,
} from '@apps/lib/utils'

export const tasks = sqliteTable('tasks', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    type: text('type', { enum: taskTypeValues }).notNull(),
    status: text('status', { enum: taskStatus })
        .notNull()
        .default('pending'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const submissions = sqliteTable('submissions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
        .notNull()
        .references(() => tasks.id),
    content: text('content').notNull(),
    grade: text('grade', { enum: defaultGradeValues }),
    aiScore: text('ai_score'),
    scoredAt: text('scored_at'),
    createdAt: text('created_at')
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
    detail: text('detail').notNull(),
    status: text('status', { enum: exchangeStatusValues })
        .notNull()
        .default('active'),
    createdAt: text('created_at')
        .notNull()
        .$defaultFn(() => new Date().toISOString()),
})

export const options = sqliteTable('options', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    key: text('key').notNull().unique(),
    value: text('value').notNull(),
})

export const aiUsageLogs = sqliteTable('ai_usage_logs', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    project: text('project').notNull(), // e.g. 'ai-score', 'ai-title'
    taskId: integer('task_id'), // associated task id
    taskTitle: text('task_title'), // associated task name
    promptTokens: integer('prompt_tokens').notNull().default(0),
    completionTokens: integer('completion_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    createdAt: text('created_at')
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
