import { db } from '@apps/db/index'
import { options } from '@apps/db/schema'
import type {
    Rules,
    GradePoints,
    ExchangeRate,
    ExamScoreRule,
    CustomRule,
} from '@apps/services/points'

// Default exchange rates (defined once for reuse)
const DEFAULT_EXCHANGE_RATES: Record<string, ExchangeRate> = {
    games: { points: 1, ratio: 10, unit: '分钟' },
    cash: { points: 10, ratio: 1, unit: '元' },
}

// Safely convert value to positive number, returning null for invalid input
function toPositiveNumber(val: unknown, fallback: number = 0): number {
    const num = Number(val)
    return Number.isNaN(num) || num < 0 ? fallback : num
}

// Convert object format {A+:50, A:20} to array format [{grade:'A+',points:50}]
function toGradePoints(obj: unknown): GradePoints[] {
    if (Array.isArray(obj)) {
        // Validate array items have expected structure
        // Allow negative points for grades like C, D, E (deductions)
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

// Convert old {points, minutes/yuan} format or new {points, ratio, unit} format to normalized ExchangeRate
function normalizeExchangeRateItem(
    item: Record<string, unknown>,
): ExchangeRate {
    // New format with ratio + unit
    if (item.ratio !== undefined) {
        return {
            points: toPositiveNumber(item.points, 1),
            ratio: toPositiveNumber(item.ratio, 1),
            unit: String(item.unit ?? '次'),
        }
    }
    // Old format with minutes
    if (item.minutes !== undefined) {
        const ratio = toPositiveNumber(item.minutes, 1)
        return {
            points: toPositiveNumber(item.points, 1),
            ratio,
            unit: '分钟',
            minutes: ratio,
        }
    }
    // Old format with yuan
    if (item.yuan !== undefined) {
        const ratio = toPositiveNumber(item.yuan, 1)
        return {
            points: toPositiveNumber(item.points, 1),
            ratio,
            unit: '元',
            yuan: ratio,
        }
    }
    // Old format: parse unit string
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

// Convert exchange data (array or object format) to Record<string, ExchangeRate>
function normalizeExchangeRates(data: unknown): {
    [key: string]: ExchangeRate
} {
    const result: Record<string, ExchangeRate> = {}

    if (Array.isArray(data)) {
        // New array format: [{key, label, points, minutes?, yuan?}]
        for (const item of data) {
            const obj = item as Record<string, unknown>
            const key = String(obj.key ?? '')
            if (!key) continue
            result[key] = normalizeExchangeRateItem(obj)
        }
    } else if (data && typeof data === 'object') {
        // Old object format: {tv: {points, minutes}, ...}
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

// Safely parse JSON, returning null on failure (logs errors for debugging)
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

// Single DB query: load all options rows and build a map
async function loadAllRuleRows(): Promise<Map<string, string>> {
    const rows = await db.select().from(options)
    const rowMap = new Map<string, string>()
    for (const row of rows) {
        rowMap.set(row.key, row.value)
    }
    return rowMap
}

// Build RawRules from separate keys in the row map
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

// Build from old single 'default' key in the row map
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
    // Try nested 'rules' or 'value' property, fallback to parsed object itself
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

// Load rules and raw source data in a single DB query
// Useful when both rules and exchange labels are needed (e.g. exchanges route)
export async function loadRulesWithSrc(): Promise<{
    rules: Rules
    exchangeSrc: unknown
}> {
    // Single DB query for all rows
    const rowMap = await loadAllRuleRows()

    // Try new separate keys first
    const separateResult = buildFromSeparateKeys(rowMap)
    if (separateResult.raw) {
        const src = separateResult.raw
        const homework = toGradePoints(src.homework)

        // Exam: handle both {ranges} and plain array
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

        // System overrides
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

        // Exchange
        const exchangeSrc = src.exchange ?? null
        const exchangeRates = normalizeExchangeRates(exchangeSrc)
        if (Object.keys(exchangeRates).length === 0) {
            Object.assign(exchangeRates, DEFAULT_EXCHANGE_RATES)
        }

        // Custom
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

    // Fallback to old single 'default' key
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

    // Handle both array format [{grade,points}] and object format {A+:50, A:20}
    const homework = toGradePoints(gradingScale?.homework ?? src.homework)

    // Handle exchange rates (supports array and object formats)
    const exchangeRates = normalizeExchangeRates(defaultResult.exchangeSrc)
    // Only fill defaults when no exchange data exists at all (fresh install)
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

// Get exchange item label by key from raw source data
export function getExchangeItemLabel(src: unknown, key: string): string {
    const defaultLabels: Record<string, string> = {
        games: '游戏',
        cash: '现金',
    }

    if (!src || typeof src !== 'object') return defaultLabels[key] ?? key

    // Array format: [{key, label, points, ...}]
    if (Array.isArray(src)) {
        const item = (src as Record<string, unknown>[]).find(
            (i) => i.key === key,
        )
        const label = item?.label
        // Use label only if it's a non-empty string; otherwise fallback
        if (typeof label === 'string' && label.length > 0) return label
        return defaultLabels[key] ?? key
    }

    // Object format: {tv: {label, points, ...}, ...}
    const obj = (src as Record<string, unknown>)[key] as
        | Record<string, unknown>
        | undefined
    const label = obj?.label
    if (typeof label === 'string' && label.length > 0) return label
    return defaultLabels[key] ?? key
}
