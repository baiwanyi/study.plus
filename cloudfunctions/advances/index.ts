import type { AdvanceSummary, PointAdvanceRow } from '../common/types'
import {
    createAdvance,
    getAdvanceSummary,
    repayActiveAdvances,
    isFirstDayOfMonth,
} from '../common/advance-helper'
import { listChildren } from '../common/children'
import { query } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'

interface AdvancesEvent {
    token?: string
    childId?: number
    action: 'list' | 'summary' | 'create' | 'repay'
    id?: number
    status?: string
    amount?: number
    installments?: number
}

async function aggregateSummary(parentId: number): Promise<AdvanceSummary> {
    const children = await listChildren(parentId)
    const summaries = await Promise.all(
        children.map((c) => getAdvanceSummary(c.childId)),
    )
    return summaries.reduce(
        (acc, s) => ({
            totalPendingRepayment: acc.totalPendingRepayment + s.totalPendingRepayment,
            currentInstallmentDue: acc.currentInstallmentDue + s.currentInstallmentDue,
            totalRemainingInstallments:
                acc.totalRemainingInstallments + s.totalRemainingInstallments,
            remainingCredit: acc.remainingCredit + s.remainingCredit,
            maxPendingAmount: acc.maxPendingAmount + s.maxPendingAmount,
        }),
        {
            totalPendingRepayment: 0,
            currentInstallmentDue: 0,
            totalRemainingInstallments: 0,
            remainingCredit: 0,
            maxPendingAmount: 0,
        },
    )
}

export async function main(event: AdvancesEvent): Promise<unknown> {
    return run(async () => {
        // 定时触发器（每月 1 日）触发，无登录态，直接对全部活跃预支执行还款
        if (event.action === 'timer-repay') {
            if (!isFirstDayOfMonth()) {
                return { success: true, skipped: true, reason: '非每月 1 日' }
            }
            const users = await query<{ user_id: number }>(
                'SELECT DISTINCT user_id FROM point_advances WHERE status = ?',
                ['active'],
            )
            let repaid = 0
            for (const u of users) {
                repaid += await repayActiveAdvances(u.user_id)
            }
            return { success: true, repaid, users: users.length }
        }

        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const rawStatus = event.status
            if (rawStatus && rawStatus !== 'active' && rawStatus !== 'completed') {
                throw new HttpError(400, '无效的状态值，仅支持 active 或 completed')
            }
            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (rawStatus) {
                where.push('status = ?')
                params.push(rawStatus)
            }
            const records = await query<PointAdvanceRow>(
                `SELECT * FROM point_advances WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
                params,
            )
            return records
        }

        if (action === 'summary') {
            if (ctx.targetUserId != null) {
                return getAdvanceSummary(ctx.targetUserId)
            }
            return aggregateSummary(ctx.auth.userId)
        }

        if (action === 'create') {
            const userId = requireTargetUser(ctx)
            const { amount, installments } = event
            if (
                typeof amount !== 'number' ||
                !Number.isInteger(amount) ||
                amount <= 0
            ) {
                throw new HttpError(400, '预支积分必须为正整数')
            }
            if (![1, 3, 6, 9, 12].includes(Number(installments))) {
                throw new HttpError(400, '期数仅支持 1/3/6/9/12 五个档位')
            }
            return createAdvance(userId, amount, Number(installments))
        }

        if (action === 'repay') {
            if (!isFirstDayOfMonth()) {
                throw new HttpError(400, '仅限每月 1 日执行还款')
            }
            let repaid = 0
            if (ctx.targetUserId != null) {
                repaid = await repayActiveAdvances(ctx.targetUserId)
            } else {
                const children = await listChildren(ctx.auth.userId)
                for (const c of children) {
                    repaid += await repayActiveAdvances(c.childId)
                }
            }
            return { success: true, repaid }
        }

        throw new HttpError(400, '未知的 action')
    })
}
