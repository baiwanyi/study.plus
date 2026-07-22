import { COLLECTION_OPTIONS, nosql } from './nosql'
import {
    defaultExchangeRules,
    defaultExamRules,
    defaultHomeworkRules,
    defaultSystemSettings,
} from './constants'

export interface HomeworkGradeRule {
    grade: string
    points: number
}
export interface ExamRuleRange {
    min: number
    max: number
    points: number
}
export interface ExchangeItemRule {
    key: string
    label: string
    points: number
    ratio: number
    unit: string
}
export interface CustomRule {
    id?: string
    name: string
    type: 'earn' | 'deduct'
    points: number
    description: string
}
export interface AllRules {
    homework: HomeworkGradeRule[]
    exam: ExamRuleRange[]
    exchange: ExchangeItemRule[]
    custom: CustomRule[]
}
export interface SystemSettings {
    pageSize: number
    autosaveInterval: number
    monthlyBasePoints: number
    minimumPointsForPrivileges: number
    advanceRepayRatio: number
    maxPendingAmount: number
}

const RULES_KEY = 'rules'
const SETTINGS_KEY = 'systemSettings'

async function readOption<T>(key: string, fallback: T): Promise<T> {
    try {
        const res = await nosql
            .collection(COLLECTION_OPTIONS)
            .where({ key })
            .get()
        const docs = res.data as Array<{ value: T }>
        if (docs && docs.length > 0) return docs[0].value
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[Read Option Failed]', key, msg)
    }
    return fallback
}

/** 读取全部积分规则（运行时以 NoSQL 为准，缺失则用默认值） */
export async function loadRules(): Promise<AllRules> {
    const stored = await readOption<Partial<AllRules> | null>(RULES_KEY, null)
    if (!stored) {
        return {
            homework: defaultHomeworkRules,
            exam: defaultExamRules,
            exchange: defaultExchangeRules,
            custom: [],
        }
    }
    return {
        homework: stored.homework ?? defaultHomeworkRules,
        exam: stored.exam ?? defaultExamRules,
        exchange: stored.exchange ?? defaultExchangeRules,
        custom: stored.custom ?? [],
    }
}

export async function loadSystemSettings(): Promise<SystemSettings> {
    const stored = await readOption<Partial<SystemSettings> | null>(
        SETTINGS_KEY,
        null,
    )
    return { ...defaultSystemSettings, ...(stored ?? {}) }
}

/** 根据作业评级获取积分 */
export function pointsForHomeworkGrade(
    rules: AllRules,
    grade: string,
): number {
    const rule = rules.homework.find((r) => r.grade === grade)
    return rule ? rule.points : 0
}

/** 根据单元测评分值获取积分 */
export function pointsForExamScore(rules: AllRules, score: number): number {
    const rule = rules.exam.find((r) => score >= r.min && score <= r.max)
    return rule ? rule.points : 0
}
