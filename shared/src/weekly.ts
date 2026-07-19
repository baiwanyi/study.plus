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
 * - 类型不匹配或 JSON 损坏 → 返回空内容（不抛异常）
 */
export function parseContent(raw: unknown): WeeklyReportContent {
    if (raw == null) return createEmptyContent()
    if (typeof raw === 'string') {
        try {
            return WeeklyContentSchema.parse(JSON.parse(raw))
        } catch {
            return createEmptyContent()
        }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
        try {
            return WeeklyContentSchema.parse(raw)
        } catch {
            return createEmptyContent()
        }
    }
    return createEmptyContent()
}

/**
 * 统一序列化：将 WeeklyReportContent 对象转为 JSON 字符串。
 * - 只保留 schema 定义的字段
 * - 缺失的非字符串字段补默认值
 */
export function stringifyContent(content: WeeklyReportContent): string {
    return JSON.stringify(WeeklyContentSchema.parse(content))
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

/** ISO 周数：获取指定日期所在的年度第几周 */
export function getWeekNumber(date: Date): number {
    const temp = new Date(date.valueOf())
    const dayNum = (date.getDay() + 6) % 7
    temp.setDate(temp.getDate() - dayNum + 3)
    const firstThursday = temp.valueOf()
    temp.setMonth(0, 1)
    if (temp.getDay() !== 4) {
        temp.setMonth(0, 1 + ((4 - temp.getDay() + 7) % 7))
    }
    return 1 + Math.ceil((firstThursday - temp.valueOf()) / MS_PER_WEEK)
}

/** 利用 Schema 默认值生成空白内容 */
const EMPTY_CONTENT = WeeklyContentSchema.parse({})
export function createEmptyContent(): WeeklyReportContent {
    return { ...EMPTY_CONTENT }
}
