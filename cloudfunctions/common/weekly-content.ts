export interface WeeklyReportContent {
    learned: string
    difficulties: string
    weakPoints: string
    achievement: string
    lastWeekGoalReview: string
    smartGoalS: string
    smartGoalM: string
    smartGoalA: string
    smartGoalR: string
    smartGoalT: string
    improvement: string
}

const FIELDS: Array<keyof WeeklyReportContent> = [
    'learned',
    'difficulties',
    'weakPoints',
    'achievement',
    'lastWeekGoalReview',
    'smartGoalS',
    'smartGoalM',
    'smartGoalA',
    'smartGoalR',
    'smartGoalT',
    'improvement',
]

export function createEmptyContent(): WeeklyReportContent {
    return {
        learned: '',
        difficulties: '',
        weakPoints: '',
        achievement: '',
        lastWeekGoalReview: '',
        smartGoalS: '',
        smartGoalM: '',
        smartGoalA: '',
        smartGoalR: '',
        smartGoalT: '',
        improvement: '',
    }
}

/** 安全解析：缺字段补默认，损坏返回空内容，不抛异常 */
export function parseContent(raw: unknown): WeeklyReportContent {
    const empty = createEmptyContent()
    if (raw == null) return empty
    let obj: unknown = raw
    if (typeof raw === 'string') {
        try {
            obj = JSON.parse(raw)
        } catch {
            return empty
        }
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) return empty
    const src = obj as Record<string, unknown>
    const result = createEmptyContent()
    for (const f of FIELDS) {
        const v = src[f]
        result[f] = typeof v === 'string' ? v : ''
    }
    return result
}

export function stringifyContent(content: WeeklyReportContent): string {
    const result: Record<string, string> = {}
    for (const f of FIELDS) {
        result[f] = typeof content[f] === 'string' ? (content[f] as string) : ''
    }
    return JSON.stringify(result)
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
