import { query, execute } from './db'
import { loadRules } from './rules'
import type { MonthSummaryRow } from './types'
import { monthRange } from './date-utils'

export interface ComputedSummary {
    id: number
    userId: number
    month: string
    basePoints: number
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    minimumPointsForPrivileges: number
    monthlyBasePoints: number
}

function monthDateRange(targetMonth: string): { start: string; end: string } {
    return monthRange(targetMonth)
}

async function ensureMonthRow(
    userId: number,
    targetMonth: string,
): Promise<MonthSummaryRow> {
    const existing = await query<MonthSummaryRow>(
        'SELECT * FROM month_summary WHERE user_id = ? AND month = ?',
        [userId, targetMonth],
    )
    if (existing.length > 0) return existing[0]

    const rules = await loadRules()
    const defaultBasePoints = rules.monthlyBasePoints

    const [y, m] = targetMonth.split('-').map(Number)
    const prevDate = new Date(Date.UTC(y, m - 2, 1))
    const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`

    let basePoints = defaultBasePoints
    const prevRows = await query<MonthSummaryRow>(
        'SELECT * FROM month_summary WHERE user_id = ? AND month = ?',
        [userId, prevMonth],
    )
    if (prevRows.length > 0) {
        const prev = prevRows[0]
        const { start, end } = monthDateRange(prevMonth)
        const prevEarn = await query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
       WHERE user_id = ? AND type = 'earn' AND related_type <> 'revoked'
       AND created_at >= ? AND created_at <= ?`,
            [userId, start, end],
        )
        const prevDeduct = await query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
       WHERE user_id = ? AND type = 'deduct' AND related_type <> 'revoked'
       AND created_at >= ? AND created_at <= ?`,
            [userId, start, end],
        )
        basePoints =
            prev.basePoints +
            (prevEarn[0]?.total ?? 0) -
            (prevDeduct[0]?.total ?? 0) +
            defaultBasePoints
    }

    const res = await execute(
        'INSERT INTO month_summary (user_id, month, base_points) VALUES (?, ?, ?)',
        [userId, targetMonth, basePoints],
    )
    return {
        id: res.insertId,
        userId,
        month: targetMonth,
        basePoints,
        totalEarn: 0,
        totalDeduct: 0,
        totalExchanges: 0,
        balance: basePoints,
    }
}

/** 重算某用户某月的积分汇总（净变化、兑换、余额、可用余额） */
export async function recomputeMonthSummary(
    userId: number,
    targetMonth: string,
): Promise<ComputedSummary> {
    const { start, end } = monthDateRange(targetMonth)
    const summary = await ensureMonthRow(userId, targetMonth)
    const rules = await loadRules()
    const minimumPointsForPrivileges = rules.minimumPointsForPrivileges

    const earn = await query<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
     WHERE user_id = ? AND type = 'earn' AND related_type <> 'revoked'
     AND created_at >= ? AND created_at <= ?`,
        [userId, start, end],
    )
    const deduct = await query<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
     WHERE user_id = ? AND type = 'deduct' AND related_type <> 'revoked'
     AND created_at >= ? AND created_at <= ?`,
        [userId, start, end],
    )
    const exchanges = await query<{ total: number }>(
        `SELECT COALESCE(SUM(points_cost),0) AS total FROM exchanges
     WHERE user_id = ? AND status = 'active' AND created_at >= ? AND created_at <= ?`,
        [userId, start, end],
    )
    const advanceEarn = await query<{ total: number }>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
     WHERE user_id = ? AND type = 'earn' AND reason LIKE ? AND created_at >= ? AND created_at <= ?`,
        [userId, '积分预支 - %', start, end],
    )

    const totalEarn = earn[0]?.total ?? 0
    const totalDeduct = deduct[0]?.total ?? 0
    const totalExchanges = exchanges[0]?.total ?? 0
    const advanceEarnTotal = advanceEarn[0]?.total ?? 0

    const balance = summary.basePoints + totalEarn - totalDeduct
    const availableBalance =
        summary.basePoints -
        rules.monthlyBasePoints -
        totalExchanges +
        advanceEarnTotal

    await execute(
        `UPDATE month_summary SET total_earn = ?, total_deduct = ?, total_exchanges = ?, balance = ?
     WHERE user_id = ? AND month = ?`,
        [totalEarn, totalDeduct, totalExchanges, balance, userId, targetMonth],
    )

    return {
        id: summary.id,
        userId,
        month: targetMonth,
        basePoints: summary.basePoints,
        totalEarn,
        totalDeduct,
        totalExchanges,
        balance,
        availableBalance,
        minimumPointsForPrivileges,
        monthlyBasePoints: rules.monthlyBasePoints,
    }
}
