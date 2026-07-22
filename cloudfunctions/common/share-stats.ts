import { listChildren } from './children'
import { query } from './db'
import { loadRules } from './rules'
import { recomputeMonthSummary } from './summary-helper'
import { monthRange } from './date-utils'

export interface ExchangeInfo {
    totalDuration: number
    longestDay: string
    longestDayDuration: number
}

export interface ShareStats {
    month: string
    exchangeInfo: ExchangeInfo
    monthlyEarnExcluding: number
    monthlyDeductExcluding: number
    submissionEarnTotal: number
    examEarnTotal: number
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
}

export async function computeShareStats(userId: number, month: string): Promise<ShareStats> {
    const { start, end } = monthRange(month)
    const [rules, gameExchanges, earnExcl, deductExcl, submissionEarn, examEarn] = await Promise.all([
        loadRules(),
        query<{ points_cost: number; created_at: string }>(
            `SELECT points_cost, created_at FROM exchanges
         WHERE item_type IN ('game', 'games') AND status = 'active'
         AND user_id = ? AND created_at >= ? AND created_at <= ?`,
            [userId, start, end],
        ),
        query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
         WHERE user_id = ? AND type = 'earn' AND related_type <> 'exchange'
         AND related_type <> 'revoked' AND reason NOT LIKE ? AND created_at >= ? AND created_at <= ?`,
            [userId, '积分预支 - %', start, end],
        ),
        query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
         WHERE user_id = ? AND type = 'deduct' AND related_type <> 'exchange'
         AND related_type <> 'revoked' AND reason NOT LIKE ? AND created_at >= ? AND created_at <= ?`,
            [userId, '积分预支 - %', start, end],
        ),
        query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
         WHERE user_id = ? AND type = 'earn' AND related_type = 'submission'
         AND created_at >= ? AND created_at <= ?`,
            [userId, start, end],
        ),
        query<{ total: number }>(
            `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
         WHERE user_id = ? AND type = 'earn' AND related_type = 'exam'
         AND created_at >= ? AND created_at <= ?`,
            [userId, start, end],
        ),
    ])
    const gameRate = rules.exchange.find((e) => e.key === 'game') ??
        rules.exchange.find((e) => e.key === 'games')
    const gameDurationPerPoint = gameRate ? gameRate.ratio : 10
    const gamePointsPerDuration = gameRate ? gameRate.points : 1

    const dayDurationMap = new Map<string, number>()
    let totalDuration = 0
    for (const ex of gameExchanges) {
        const duration = (ex.points_cost * gameDurationPerPoint) / gamePointsPerDuration
        totalDuration += duration
        const day = ex.created_at.slice(0, 10)
        dayDurationMap.set(day, (dayDurationMap.get(day) || 0) + duration)
    }
    let longestDay = ''
    let longestDayDuration = 0
    for (const [day, duration] of dayDurationMap) {
        if (duration > longestDayDuration) {
            longestDay = day
            longestDayDuration = duration
        }
    }

    const summary = await recomputeMonthSummary(userId, month)
    return {
        month,
        exchangeInfo: { totalDuration, longestDay, longestDayDuration },
        monthlyEarnExcluding: earnExcl[0]?.total ?? 0,
        monthlyDeductExcluding: deductExcl[0]?.total ?? 0,
        submissionEarnTotal: submissionEarn[0]?.total ?? 0,
        examEarnTotal: examEarn[0]?.total ?? 0,
        totalEarn: summary.totalEarn,
        totalDeduct: summary.totalDeduct,
        totalExchanges: summary.totalExchanges,
        balance: summary.balance,
        availableBalance: summary.availableBalance,
    }
}

export async function aggregateShareStats(parentId: number, month: string): Promise<ShareStats> {
    const children = await listChildren(parentId)
    if (children.length === 0) {
        return {
            month,
            exchangeInfo: { totalDuration: 0, longestDay: '', longestDayDuration: 0 },
            monthlyEarnExcluding: 0,
            monthlyDeductExcluding: 0,
            submissionEarnTotal: 0,
            examEarnTotal: 0,
            totalEarn: 0,
            totalDeduct: 0,
            totalExchanges: 0,
            balance: 0,
            availableBalance: 0,
        }
    }
    const parts = await Promise.all(
        children.map((c) => computeShareStats(c.childId, month)),
    )
    return {
        month,
        exchangeInfo: {
            totalDuration: parts.reduce((s, p) => s + p.exchangeInfo.totalDuration, 0),
            longestDay: parts.reduce((a, b) =>
                a.exchangeInfo.longestDayDuration >= b.exchangeInfo.longestDayDuration
                    ? a
                    : b,
            ).exchangeInfo.longestDay,
            longestDayDuration: Math.max(
                ...parts.map((p) => p.exchangeInfo.longestDayDuration),
            ),
        },
        monthlyEarnExcluding: parts.reduce((s, p) => s + p.monthlyEarnExcluding, 0),
        monthlyDeductExcluding: parts.reduce((s, p) => s + p.monthlyDeductExcluding, 0),
        submissionEarnTotal: parts.reduce((s, p) => s + p.submissionEarnTotal, 0),
        examEarnTotal: parts.reduce((s, p) => s + p.examEarnTotal, 0),
        totalEarn: parts.reduce((s, p) => s + p.totalEarn, 0),
        totalDeduct: parts.reduce((s, p) => s + p.totalDeduct, 0),
        totalExchanges: parts.reduce((s, p) => s + p.totalExchanges, 0),
        balance: parts.reduce((s, p) => s + p.balance, 0),
        availableBalance: parts.reduce((s, p) => s + p.availableBalance, 0),
    }
}
