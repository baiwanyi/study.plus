import { eq } from 'drizzle-orm'
import { defaultSystemSettings } from '@shared/constants'
import { db } from '../db/index'
import { options, pointAdvances, pointRecords } from '../db/schema'
import { recomputeMonthSummary } from './summary-helper'

const VALID_ADVANCE_INSTALLMENTS = [1, 3, 6, 9, 12]

interface SystemSettings {
    advanceRepayRatio: number
    maxPendingAmount: number
    [key: string]: unknown
}

export async function loadSystemSettings(): Promise<SystemSettings> {
    try {
        const rows = await db
            .select()
            .from(options)
            .where(eq(options.key, 'system'))
        if (rows[0] && typeof rows[0].value === 'string') {
            const parsed = JSON.parse(rows[0].value)
            // 运行时守卫：防止 DB 中存储的畸形数据（非对象）污染配置合并
            if (
                parsed !== null &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
            ) {
                return {
                    ...defaultSystemSettings,
                    ...parsed,
                } as SystemSettings
            }
        }
    } catch (error) {
        console.error('Failed to load system settings', error)
    }
    return defaultSystemSettings as SystemSettings
}

export function isFirstDayOfMonth(): boolean {
    // 与系统时间基准一致：monthSummary 使用 UTC 年月、积分记录 createdAt 存 UTC，
    // 故此处用 getUTCDate 判断，避免本地时区与 UTC 的月初错位（如东八区 8 小时偏移）
    // 导致定时还款任务重复或漏触发。
    return new Date().getUTCDate() === 1
}

export function calculateAdvanceRepayment(
    amount: number,
    installments: number,
    baseRatio: number = 16,
): { totalRepayment: number; installmentAmount: number; ratio: number } {
    if (amount <= 0 || !Number.isFinite(amount)) {
        throw new Error(`预支金额无效：${amount}`)
    }
    if (!VALID_ADVANCE_INSTALLMENTS.includes(installments)) {
        throw new Error(
            `预支期数无效：${installments}，仅支持 ${VALID_ADVANCE_INSTALLMENTS.join('/')}`,
        )
    }
    const tierIndex = VALID_ADVANCE_INSTALLMENTS.indexOf(installments)
    const ratio = baseRatio + tierIndex * 2
    const baseRepayment = Math.round(amount * (1 + ratio / 100))
    // 确保数学不变性: totalRepayment === installmentAmount * installments
    // 下游代码（剩余待还计算）依赖此等式，详见 advance-helper.ts 调用方
    const installmentAmount = Math.ceil(baseRepayment / installments)
    const totalRepayment = installmentAmount * installments
    return { totalRepayment, installmentAmount, ratio }
}

// Repay one installment for every active advance. Pure business logic
// (no date guard) so it can be reused by the scheduled task without an
// internal HTTP round-trip. Returns total points deducted.
export async function repayActiveAdvances(): Promise<number> {
    let totalRepaid = 0

    await db.transaction(async (tx) => {
        const activeAdvances = await tx
            .select()
            .from(pointAdvances)
            .where(eq(pointAdvances.status, 'active'))

        for (const adv of activeAdvances) {
            if (adv.paidInstallments >= adv.installments) continue

            const reason =
                `积分预支还款 - 第 ${adv.paidInstallments + 1}/${adv.installments} 期`

            await tx.insert(pointRecords).values({
                type: 'deduct',
                amount: adv.installmentAmount,
                reason,
                relatedId: adv.id,
                relatedType: 'advance',
            })

            const newPaid = adv.paidInstallments + 1
            const newStatus =
                newPaid >= adv.installments ? 'completed' : 'active'

            await tx
                .update(pointAdvances)
                .set({
                    paidInstallments: newPaid,
                    status: newStatus,
                })
                .where(eq(pointAdvances.id, adv.id))

            totalRepaid += adv.installmentAmount
        }

        if (totalRepaid > 0) {
            await recomputeMonthSummary(
                new Date().toISOString().slice(0, 7),
                tx,
            )
        }
    })

    return totalRepaid
}
