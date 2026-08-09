import { and, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { db } from '../db/index'
import { pointRecords, monthSummary, exchanges } from '../db/schema'
import { loadRules } from './rules-loader'
import type { MonthSummary } from '@shared/types'

// 事务句柄类型：db.transaction 回调参数类型（SQLiteTransaction），与 typeof db 组成联合，
// 使 recompute 既能接受主库 db 也能接受事务内 tx。
type DbOrTx =
    | typeof db
    | (Parameters<typeof db.transaction>[0] extends (tx: infer T) => unknown
          ? T
          : never)

interface ComputedSummary extends MonthSummary {
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    minimumPointsForPrivileges: number
}

async function ensureMonthRow(
    targetMonth: string,
    tx: DbOrTx = db,
    rules?: Awaited<ReturnType<typeof loadRules>>,
): Promise<MonthSummary> {
    const loadedRules = rules ?? (await loadRules())
    const rows = (await tx
        .select()
        .from(monthSummary)
        .where(eq(monthSummary.month, targetMonth))) as MonthSummary[]
    if (rows.length > 0) return rows[0]

    const defaultBasePoints = loadedRules.monthlyBasePoints

    const prevMonthDate = new Date(`${targetMonth}-01T00:00:00.000Z`)
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
    const prevMonth = prevMonthDate.toISOString().slice(0, 7)

    let basePoints = defaultBasePoints
    const prevRows = (await tx
        .select()
        .from(monthSummary)
        .where(eq(monthSummary.month, prevMonth))) as MonthSummary[]
    if (prevRows.length > 0) {
        const prev = prevRows[0]
        const prevStartDate = new Date(`${prevMonth}-01T00:00:00.000Z`)
        const prevEndDate = new Date(prevStartDate)
        prevEndDate.setUTCMonth(prevEndDate.getUTCMonth() + 1)
        prevEndDate.setUTCDate(0)
        prevEndDate.setUTCHours(23, 59, 59, 999)
        const prevStart = prevStartDate.toISOString()
        const prevEnd = prevEndDate.toISOString()
        const prevEarn = await tx
            .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
            .from(pointRecords)
            .where(
                and(
                    eq(pointRecords.type, 'earn'),
                    or(
                        isNull(pointRecords.relatedType),
                        ne(pointRecords.relatedType, 'revoked'),
                    ),
                    gte(pointRecords.createdAt, prevStart),
                    lte(pointRecords.createdAt, prevEnd),
                ),
            )
        const prevDeduct = await tx
            .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
            .from(pointRecords)
            .where(
                and(
                    eq(pointRecords.type, 'deduct'),
                    or(
                        isNull(pointRecords.relatedType),
                        ne(pointRecords.relatedType, 'revoked'),
                    ),
                    gte(pointRecords.createdAt, prevStart),
                    lte(pointRecords.createdAt, prevEnd),
                ),
            )
        basePoints =
            prev.basePoints +
            Number(prevEarn[0]?.total || 0) -
            Number(prevDeduct[0]?.total || 0) +
            defaultBasePoints
    }

    const inserted = await tx
        .insert(monthSummary)
        .values({ month: targetMonth, basePoints })
        .returning()
    return inserted[0] as MonthSummary
}

export async function recomputeMonthSummary(
    targetMonth: string,
    tx: DbOrTx = db,
): Promise<ComputedSummary> {
    // 校验月份格式（YYYY-MM），避免 Invalid Date 经 toISOString() 抛错或写入脏数据
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) {
        throw new Error(`targetMonth 格式非法: ${targetMonth}，应为 YYYY-MM`)
    }
    const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`)
    const endDate = new Date(startDate)
    endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    endDate.setUTCDate(0)
    endDate.setUTCHours(23, 59, 59, 999)
    const start = startDate.toISOString()
    const end = endDate.toISOString()

    const rules = await loadRules()
    const summary = await ensureMonthRow(targetMonth, tx, rules)

    const minimumPointsForPrivileges = rules.minimumPointsForPrivileges

    const earnResult = await tx
        .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
        .from(pointRecords)
        .where(
            and(
                eq(pointRecords.type, 'earn'),
                or(
                    isNull(pointRecords.relatedType),
                    ne(pointRecords.relatedType, 'revoked'),
                ),
                gte(pointRecords.createdAt, start),
                lte(pointRecords.createdAt, end),
            ),
        )
    const deductResult = await tx
        .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
        .from(pointRecords)
        .where(
            and(
                eq(pointRecords.type, 'deduct'),
                or(
                    isNull(pointRecords.relatedType),
                    ne(pointRecords.relatedType, 'exchange'),
                ),
                or(
                    isNull(pointRecords.relatedType),
                    ne(pointRecords.relatedType, 'revoked'),
                ),
                gte(pointRecords.createdAt, start),
                lte(pointRecords.createdAt, end),
            ),
        )

    const totalEarn = Number(earnResult[0]?.total) || 0
    const totalDeduct = Number(deductResult[0]?.total) || 0

    const exchangesResult = await tx
        .select({ total: sql`COALESCE(SUM(${exchanges.pointsCost}), 0)` })
        .from(exchanges)
        .where(
            and(
                eq(exchanges.status, 'active'),
                gte(exchanges.createdAt, start),
                lte(exchanges.createdAt, end),
            ),
        )
    const totalExchanges = Number(exchangesResult[0]?.total) || 0

    // 预支发放额已计入 pointRecords 的 earn（reason 形如「积分预支 - N期」），
    // 经由 totalEarn 进入 balance，无需在 availableBalance 中重复累加。
    const balance = summary.basePoints + totalEarn - totalDeduct
    // 可用余额 = 当前总余额 - 已兑换消耗（兑换扣减统一由 exchanges 表计数，
    // 因此 pointRecords 中 relatedType='exchange' 的 deduct 已在上文排除，避免重复扣减）。
    const availableBalance = balance - totalExchanges

    await tx
        .update(monthSummary)
        .set({ totalEarn, totalDeduct, totalExchanges, balance })
        .where(eq(monthSummary.month, targetMonth))

    return {
        ...summary,
        totalEarn,
        totalDeduct,
        totalExchanges,
        balance,
        availableBalance,
        minimumPointsForPrivileges,
        monthlyBasePoints: rules.monthlyBasePoints,
    }
}
