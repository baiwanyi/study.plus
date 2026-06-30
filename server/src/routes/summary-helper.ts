import { db } from '../db/index'
import { pointRecords, monthSummary, exchanges } from '../db/schema'
import { eq, and, gte, lte, sql, ne, like } from 'drizzle-orm'
import { loadRules } from './rules-loader'
import type { MonthSummary } from '@shared/types'


interface ComputedSummary extends MonthSummary {
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    minimumPointsForPrivileges: number
}

async function ensureMonthRow(targetMonth: string): Promise<MonthSummary> {
    const rows = (await db
        .select()
        .from(monthSummary)
        .where(eq(monthSummary.month, targetMonth))) as MonthSummary[]
    if (rows.length > 0) return rows[0]

    const rules = await loadRules()
    const defaultBasePoints = rules.monthlyBasePoints

    const prevMonthDate = new Date(`${targetMonth}-01T00:00:00.000Z`)
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1)
    const prevMonth = prevMonthDate.toISOString().slice(0, 7)

    let basePoints = defaultBasePoints
    const prevRows = (await db
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
        const prevEarn = await db
            .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
            .from(pointRecords)
            .where(
                and(
                    eq(pointRecords.type, 'earn'),
                    ne(pointRecords.relatedType, 'revoked'),
                    gte(pointRecords.createdAt, prevStart),
                    lte(pointRecords.createdAt, prevEnd),
                ),
            )
        const prevDeduct = await db
            .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
            .from(pointRecords)
            .where(
                and(
                    eq(pointRecords.type, 'deduct'),
                    ne(pointRecords.relatedType, 'revoked'),
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

    const inserted = await db
        .insert(monthSummary)
        .values({ month: targetMonth, basePoints })
        .returning()
    return inserted[0] as MonthSummary
}

export async function recomputeMonthSummary(
    targetMonth: string,
): Promise<ComputedSummary> {
    const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`)
    const endDate = new Date(startDate)
    endDate.setUTCMonth(endDate.getUTCMonth() + 1)
    endDate.setUTCDate(0)
    endDate.setUTCHours(23, 59, 59, 999)
    const start = startDate.toISOString()
    const end = endDate.toISOString()

    const summary = await ensureMonthRow(targetMonth)

    const rules = await loadRules()
    const minimumPointsForPrivileges = rules.minimumPointsForPrivileges

    const earnResult = await db
        .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
        .from(pointRecords)
        .where(
            and(
                eq(pointRecords.type, 'earn'),
                ne(pointRecords.relatedType, 'revoked'),
                gte(pointRecords.createdAt, start),
                lte(pointRecords.createdAt, end),
            ),
        )
    const deductResult = await db
        .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
        .from(pointRecords)
        .where(
            and(
                eq(pointRecords.type, 'deduct'),
                ne(pointRecords.relatedType, 'revoked'),
                gte(pointRecords.createdAt, start),
                lte(pointRecords.createdAt, end),
            ),
        )

    const totalEarn = Number(earnResult[0]?.total) || 0
    const totalDeduct = Number(deductResult[0]?.total) || 0

    const exchangesResult = await db
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

    const advanceEarnResult = await db
        .select({ total: sql`COALESCE(SUM(${pointRecords.amount}), 0)` })
        .from(pointRecords)
        .where(
            and(
                eq(pointRecords.type, 'earn'),
                like(pointRecords.reason, '积分预支 - %'),
                gte(pointRecords.createdAt, start),
                lte(pointRecords.createdAt, end),
            ),
        )
    const advanceEarn = Number(advanceEarnResult[0]?.total) || 0

    const balance = summary.basePoints + totalEarn - totalDeduct
    const availableBalance = summary.basePoints - rules.monthlyBasePoints - totalExchanges + advanceEarn

    await db
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
