import {
    defaultExchangeRules,
    defaultExamRules,
    defaultHomeworkRules,
    defaultSystemSettings,
} from './constants'
import { COLLECTION_OPTIONS, nosql } from './nosql'

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

// 内存缓存：30 秒过期，减少频繁的 NoSQL 读取
let rulesCache: { data: AllRules; expiresAt: number } | null = null
const RULES_CACHE_TTL_MS = 30_000

/** 读取全部积分规则（带 30s 内存缓存，运行时以 NoSQL 为准，缺失则用默认值） */
export async function loadRules(): Promise<AllRules> {
    if (rulesCache && Date.now() < rulesCache.expiresAt) {
        return rulesCache.data
    }
    const stored = await readOption<Partial<AllRules> | null>(RULES_KEY, null)
    const data = stored
        ? {
              homework: stored.homework ?? defaultHomeworkRules,
              exam: stored.exam ?? defaultExamRules,
              exchange: stored.exchange ?? defaultExchangeRules,
              custom: stored.custom ?? [],
          }
        : {
              homework: defaultHomeworkRules,
              exam: defaultExamRules,
              exchange: defaultExchangeRules,
              custom: [],
          }
    rulesCache = { data, expiresAt: Date.now() + RULES_CACHE_TTL_MS }
    return data
}

/** 规则更新后清除缓存，下次 loadRules 将重新从 NoSQL 读取 */
export function invalidateRulesCache(): void {
    rulesCache = null
}

// settings 内存缓存：60 秒过期
let settingsCache: { data: SystemSettings; expiresAt: number } | null = null
const SETTINGS_CACHE_TTL_MS = 60_000

export async function loadSystemSettings(): Promise<SystemSettings> {
    if (settingsCache && Date.now() < settingsCache.expiresAt) {
        return settingsCache.data
    }
    const stored = await readOption<Partial<SystemSettings> | null>(
        SETTINGS_KEY,
        null,
    )
    const data = { ...defaultSystemSettings, ...(stored ?? {}) }
    settingsCache = { data, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS }
    return data
}

export function invalidateSettingsCache(): void {
    settingsCache = null
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
