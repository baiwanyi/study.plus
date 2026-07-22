import { query, execute, insertAndGetId } from './db'
import { loadSystemSettings } from './rules'
import { recomputeMonthSummary } from './summary-helper'
import type { PointAdvanceRow } from './types'

const VALID_INSTALLMENTS = [1, 3, 6, 9, 12]

export interface AdvanceRepayment {
    totalRepayment: number
    installmentAmount: number
    ratio: number
}

export function isFirstDayOfMonth(): boolean {
    return new Date().getDate() === 1
}

/**
 * 计算预支还款方案。
 * 利率随期数递增（baseRatio + tierIndex*2），并强制保证
 * totalRepayment === installmentAmount * installments（下游剩余待还依赖此等式）。
 */
export function calculateAdvanceRepayment(
    amount: number,
    installments: number,
    baseRatio = 16,
): AdvanceRepayment {
    if (amount <= 0 || !Number.isFinite(amount)) {
        throw new Error(`预支金额无效：${amount}`)
    }
    if (!VALID_INSTALLMENTS.includes(installments)) {
        throw new Error(
            `预支期数无效：${installments}，仅支持 ${VALID_INSTALLMENTS.join('/')}`,
        )
    }
    const tierIndex = VALID_INSTALLMENTS.indexOf(installments)
    const ratio = baseRatio + tierIndex * 2
    const baseRepayment = Math.round(amount * (1 + ratio / 100))
    const installmentAmount = Math.ceil(baseRepayment / installments)
    const totalRepayment = installmentAmount * installments
    return { totalRepayment, installmentAmount, ratio }
}

/** 创建预支：校验风控上限，写入预支单并记一笔 earn（积分预支） */
export async function createAdvance(
    userId: number,
    amount: number,
    installments: number,
): Promise<PointAdvanceRow> {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('预支积分必须为正整数')
    }
    if (!VALID_INSTALLMENTS.includes(installments)) {
        throw new Error('期数仅支持 1/3/6/9/12 五个档位')
    }

    const settings = await loadSystemSettings()
    const maxPendingAmount = settings.maxPendingAmount ?? 500
    const baseRatio = settings.advanceRepayRatio ?? 16
    const tierIndex = VALID_INSTALLMENTS.indexOf(installments)
    const ratio = baseRatio + tierIndex * 2
    const totalRepayment = Math.round(amount * (1 + ratio / 100))
    const installmentAmount = Math.ceil(totalRepayment / installments)

    const active = await query<PointAdvanceRow>(
        "SELECT * FROM point_advances WHERE user_id = ? AND status = 'active'",
        [userId],
    )
    let currentPending = 0
    for (const adv of active) {
        currentPending += adv.total_repayment - adv.paid_installments * adv.installment_amount
    }
    if (currentPending + totalRepayment > maxPendingAmount) {
        throw new Error(
            `预支失败：当前待还 ${currentPending} 积分，新增预支 ${totalRepayment} 积分后总额 ${currentPending + totalRepayment} 超过风控上限 ${maxPendingAmount} 积分`,
        )
    }

    const id = await insertAndGetId(
        `INSERT INTO point_advances
     (user_id, amount, total_repayment, installments, installment_amount)
     VALUES (?, ?, ?, ?, ?)`,
        [userId, amount, totalRepayment, installments, installmentAmount],
    )
    await execute(
        `INSERT INTO point_records
     (user_id, type, amount, reason, related_id, related_type)
     VALUES (?, 'earn', ?, ?, ?, 'advance')`,
        [userId, amount, `积分预支 - ${installments}期`, id],
    )
    await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))

    const rows = await query<PointAdvanceRow>(
        'SELECT * FROM point_advances WHERE id = ?',
        [id],
    )
    return rows[0]
}

/** 偿还某用户全部活跃预支的当期一期（由定时触发器逐用户调用） */
export async function repayActiveAdvances(userId: number): Promise<number> {
    let totalRepaid = 0
    const active = await query<PointAdvanceRow>(
        "SELECT * FROM point_advances WHERE user_id = ? AND status = 'active'",
        [userId],
    )
    for (const adv of active) {
        if (adv.paid_installments >= adv.installments) continue
        const newPaid = adv.paid_installments + 1
        const newStatus = newPaid >= adv.installments ? 'completed' : 'active'

        await execute(
            `INSERT INTO point_records
       (user_id, type, amount, reason, related_id, related_type)
       VALUES (?, 'deduct', ?, ?, ?, 'advance')`,
            [
                userId,
                adv.installment_amount,
                `积分预支还款 - 第 ${newPaid}/${adv.installments} 期`,
                adv.id,
            ],
        )
        await execute(
            'UPDATE point_advances SET paid_installments = ?, status = ? WHERE id = ?',
            [newPaid, newStatus, adv.id],
        )
        totalRepaid += adv.installment_amount
    }
    if (totalRepaid > 0) {
        try {
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
        } catch (error) {
            console.error('月度摘要重算失败，还款数据已提交，请手动刷新摘要', error)
        }
    }
    return totalRepaid
}

export interface AdvanceSummary {
    totalPendingRepayment: number
    currentInstallmentDue: number
    totalRemainingInstallments: number
    remainingCredit: number
    maxPendingAmount: number
}

export async function getAdvanceSummary(userId: number): Promise<AdvanceSummary> {
    const settings = await loadSystemSettings()
    const maxPendingAmount = settings.maxPendingAmount ?? 500
    const active = await query<PointAdvanceRow>(
        "SELECT * FROM point_advances WHERE user_id = ? AND status = 'active'",
        [userId],
    )

    let totalPendingRepayment = 0
    let currentInstallmentDue = 0
    let totalRemainingInstallments = 0
    for (const adv of active) {
        const paid = adv.paid_installments * adv.installment_amount
        totalPendingRepayment += adv.total_repayment - paid
        if (adv.paid_installments < adv.installments) {
            currentInstallmentDue += adv.installment_amount
            totalRemainingInstallments += adv.installments - adv.paid_installments
        }
    }
    const remainingCredit = Math.max(0, maxPendingAmount - totalPendingRepayment)
    return {
        totalPendingRepayment,
        currentInstallmentDue,
        totalRemainingInstallments,
        remainingCredit,
        maxPendingAmount,
    }
}
