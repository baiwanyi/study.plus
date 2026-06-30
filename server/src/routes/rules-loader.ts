import { db } from '../db/index'
import { options } from '../db/schema'
import type {
    Rules,
    GradePoints,
    ExchangeRate,
    ExamScoreRule,
    CustomRule,
} from '../services/points'

const DEFAULT_EXCHANGE_RATES: Record<string, ExchangeRate> = {
    games: { points: 1, ratio: 10, unit: '分钟' },
    cash: { points: 10, ratio: 1, unit: '元' },
}

function toPositiveNumber(val: unknown, fallback: number = 0): number {
    const num = Number(val)
    return Number.isNaN(num) || num < 0 ? fallback : num
}

function toGradePoints(obj: unknown): GradePoints[] {
    if (Array.isArray(obj)) {
        return obj.filter((item): item is GradePoints => {
            return (
                item !== null &&
                typeof item === 'object' &&
                typeof (item as GradePoints).grade === 'string' &&
                typeof (item as GradePoints).points === 'number' &&
                !Number.isNaN((item as GradePoints).points)
            )
        })
    }
    if (obj && typeof obj === 'object') {
        return Object.entries(obj as Record<string, unknown>).map(
            ([grade, points]) => ({
                grade,
                points: toPositiveNumber(points, 0),
            }),
        )
    }
    return []
}

function normalizeExchangeRateItem(
    item: Record<string, unknown>,
): ExchangeRate {
    if (item.ratio !== undefined) {
        return {
            points: toPositiveNumber(item.points, 1),
            ratio: toPositiveNumber(item.ratio, 1),
            unit: String(item.unit ?? '次'),
        }
    }
    if (item.minutes !== undefined) {
        const ratio = toPositiveNumber(item.minutes, 1)
        return {
            points: toPositiveNumber(item.points, 1),
            ratio,
            unit: '分钟',
            minutes: ratio,
        }
    }
    if (item.yuan !== undefined) {
        const ratio = toPositiveNumber(item.yuan, 1)
        return {
            points: toPositiveNumber(item.points, 1),
            ratio,
            unit: '元',
            yuan: ratio,
        }
    }
    const unitStr = String(item.unit ?? '')
    const minMatch = unitStr.match(/(\d+)分钟/)
    const yuanMatch = unitStr.match(/([\d.]+)元/)
    if (minMatch) {
        return {
            points: toPositiveNumber(item.points, 1),
            ratio: toPositiveNumber(minMatch[1], 1),
            unit: '分钟',
        }
    }
    if (yuanMatch) {
        return {
            points: toPositiveNumber(item.points, 1),
            ratio: toPositiveNumber(yuanMatch[1], 1),
            unit: '元',
        }
    }
    return { points: toPositiveNumber(item.points, 1), ratio: 1, unit: '次' }
}

function normalizeExchangeRates(data: unknown): {
    [key: string]: ExchangeRate
} {
    const result: Record<string, ExchangeRate> = {}

    if (Array.isArray(data)) {
        for (const item of data) {
            const obj = item as Record<string, unknown>
            const key = String(obj.key ?? '')
            if (!key) continue
            result[key] = normalizeExchangeRateItem(obj)
        }
    } else if (data && typeof data === 'object') {
        for (const [key, val] of Object.entries(
            data as Record<string, unknown>,
        )) {
            result[key] = normalizeExchangeRateItem(
                val as Record<string, unknown>,
            )
        }
    }

    return result
}

interface RawRules {
    homework?: unknown
    exam?: unknown
    exchange?: unknown
    custom?: unknown
    system?: unknown
}

function safeJsonParse(val: string | undefined, key?: string): unknown {
    if (!val) return null
    try {
        return JSON.parse(val)
    } catch (err) {
        console.error(
            `[rules-loader] Failed to parse JSON for key "${key}":`,
            err,
        )
        return null
    }
}

async function loadAllRuleRows(): Promise<Map<string, string>> {
    const rows = await db.select().from(options)
    const rowMap = new Map<string, string>()
    for (const row of rows) {
        rowMap.set(row.key, row.value)
    }
    return rowMap
}

function buildFromSeparateKeys(rowMap: Map<string, string>): {
    raw: RawRules | null
    exchangeSrc: unknown
} {
    const separateKeys = [
        'homework',
        'exam',
        'exchange',
        'custom',
        'system',
    ] as const
    const hasSeparateKeys = separateKeys.some((k) => rowMap.has(k))
    if (!hasSeparateKeys) return { raw: null, exchangeSrc: null }

    const raw: RawRules = {}
    for (const key of separateKeys) {
        raw[key] = safeJsonParse(rowMap.get(key), key)
    }

    return { raw, exchangeSrc: raw.exchange ?? null }
}

function buildFromDefaultKey(rowMap: Map<string, string>): {
    raw: Record<string, unknown> | null
    exchangeSrc: unknown
} {
    const val = rowMap.get('default')
    if (!val) return { raw: null, exchangeSrc: null }

    const parsed = safeJsonParse(val, 'default')
    if (!parsed || typeof parsed !== 'object')
        return { raw: null, exchangeSrc: null }

    const parsedObj = parsed as Record<string, unknown>
    const src = (parsedObj.rules ?? parsedObj.value ?? parsed) as Record<
        string,
        unknown
    >
    if (!src || typeof src !== 'object') return { raw: null, exchangeSrc: null }

    const srcObj = src
    const exchangeData = srcObj.exchangeRates ?? srcObj.exchange
    return { raw: srcObj, exchangeSrc: exchangeData ?? null }
}

export async function loadRules(): Promise<Rules> {
    const { rules } = await loadRulesWithSrc()
    return rules
}

export async function loadRulesWithSrc(): Promise<{
    rules: Rules
    exchangeSrc: unknown
}> {
    const rowMap = await loadAllRuleRows()

    const separateResult = buildFromSeparateKeys(rowMap)
    if (separateResult.raw) {
        const src = separateResult.raw
        const homework = toGradePoints(src.homework)

        const examSrc = src.exam as Record<string, unknown> | undefined
        let examScoreRules: ExamScoreRule[] = []
        let monthlyBasePoints = 500
        let minimumPointsForPrivileges = 100
        if (examSrc) {
            if (Array.isArray(examSrc)) {
                examScoreRules = examSrc as ExamScoreRule[]
            } else if (examSrc.ranges) {
                examScoreRules = examSrc.ranges as ExamScoreRule[]
            }
        }

        const systemSrc = src.system as Record<string, unknown> | undefined
        if (systemSrc) {
            if (systemSrc.monthlyBasePoints !== undefined)
                monthlyBasePoints = toPositiveNumber(
                    systemSrc.monthlyBasePoints,
                    500,
                )
            if (systemSrc.minimumPointsForPrivileges !== undefined)
                minimumPointsForPrivileges = toPositiveNumber(
                    systemSrc.minimumPointsForPrivileges,
                    100,
                )
        }

        const exchangeSrc = src.exchange ?? null
        const exchangeRates = normalizeExchangeRates(exchangeSrc)
        if (Object.keys(exchangeRates).length === 0) {
            Object.assign(exchangeRates, DEFAULT_EXCHANGE_RATES)
        }

        const customRules = Array.isArray(src.custom)
            ? (src.custom as CustomRule[])
            : []

        return {
            rules: {
                monthlyBasePoints,
                minimumPointsForPrivileges,
                gradingScale: { homework },
                examScoreRules,
                exchangeRates,
                customRules,
            },
            exchangeSrc: separateResult.exchangeSrc,
        }
    }

    const defaultResult = buildFromDefaultKey(rowMap)
    if (!defaultResult.raw) {
        return {
            rules: {
                monthlyBasePoints: 500,
                minimumPointsForPrivileges: 500,
                gradingScale: { homework: [] },
                examScoreRules: [],
                exchangeRates: DEFAULT_EXCHANGE_RATES,
                customRules: [],
            },
            exchangeSrc: null,
        }
    }

    const src = defaultResult.raw
    const gradingScale = src.gradingScale as Record<string, unknown> | undefined
    const examObj = src.exam as Record<string, unknown> | undefined

    const homework = toGradePoints(gradingScale?.homework ?? src.homework)

    const exchangeRates = normalizeExchangeRates(defaultResult.exchangeSrc)
    if (Object.keys(exchangeRates).length === 0) {
        Object.assign(exchangeRates, DEFAULT_EXCHANGE_RATES)
    }

    return {
        rules: {
            monthlyBasePoints: toPositiveNumber(src.monthlyBasePoints, 500),
            minimumPointsForPrivileges: toPositiveNumber(
                src.minimumPointsForPrivileges,
                100,
            ),
            gradingScale: { homework },
            examScoreRules: (src.examScoreRules ??
                examObj?.ranges ??
                []) as ExamScoreRule[],
            exchangeRates,
            customRules: (src.customRules ?? src.custom ?? []) as CustomRule[],
        },
        exchangeSrc: defaultResult.exchangeSrc,
    }
}

export function getExchangeItemLabel(src: unknown, key: string): string {
    const defaultLabels: Record<string, string> = {
        games: '游戏',
        cash: '现金',
    }

    if (!src || typeof src !== 'object') return defaultLabels[key] ?? key

    if (Array.isArray(src)) {
        const item = (src as Record<string, unknown>[]).find(
            (i) => i.key === key,
        )
        const label = item?.label
        if (typeof label === 'string' && label.length > 0) return label
        return defaultLabels[key] ?? key
    }

    const obj = (src as Record<string, unknown>)[key] as
        | Record<string, unknown>
        | undefined
    const label = obj?.label
    if (typeof label === 'string' && label.length > 0) return label
    return defaultLabels[key] ?? key
}
