import { z } from 'zod'

/** Zod Schema：定义周报 content 字段的结构，加/删字段只需改此处 */
export const WeeklyContentSchema = z.object({
    learned: z.string().default(''),
    difficulties: z.string().default(''),
    weakPoints: z.string().default(''),
    achievement: z.string().default(''),
    lastWeekGoalReview: z.string().default(''),
    smartGoalS: z.string().default(''),
    smartGoalM: z.string().default(''),
    smartGoalA: z.string().default(''),
    smartGoalR: z.string().default(''),
    smartGoalT: z.string().default(''),
    improvement: z.string().default(''),
})

/** 从 Zod Schema 推导的类型（替代手写 interface） */
export type WeeklyReportContent = z.infer<typeof WeeklyContentSchema>

/**
 * 统一解析：将数据库中的 JSON 字符串（或未知对象）转为安全的 WeeklyReportContent。
 * - 旧数据缺字段 → 自动补默认值
 * - 旧数据多余字段 → 自动剔除
 * - 类型不匹配 → 抛出 ZodError
 */
export function parseContent(raw: unknown): WeeklyReportContent {
    if (typeof raw === 'string') {
        return WeeklyContentSchema.parse(JSON.parse(raw))
    }
    return WeeklyContentSchema.parse(raw)
}

/**
 * 统一序列化：将 WeeklyReportContent 对象转为 JSON 字符串。
 * - 只保留 schema 定义的字段
 * - 缺失的非字符串字段补默认值
 */
export function stringifyContent(content: WeeklyReportContent): string {
    return JSON.stringify(WeeklyContentSchema.parse(content))
}
