import { db } from '../db/index'
import { options } from '../db/schema'
import { eq } from 'drizzle-orm'
import { defaultSystemSettings } from '@shared/constants'

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
        if (rows[0]) {
            const parsed = JSON.parse(
                rows[0].value,
            ) as Partial<SystemSettings>
            return {
                ...defaultSystemSettings,
                ...parsed,
            } as SystemSettings
        }
    } catch {
        console.error('Failed to load system settings')
    }
    return defaultSystemSettings as unknown as SystemSettings
}

export function isFirstDayOfMonth(): boolean {
    return new Date().getDate() === 1
}

export function calculateAdvanceRepayment(
    amount: number,
    installments: number,
    baseRatio: number = 16,
): { totalRepayment: number; installmentAmount: number; ratio: number } {
    const tierIndex = [1, 3, 6, 9, 12].indexOf(installments)
    const ratio = baseRatio + tierIndex * 2
    const totalRepayment = Math.round(amount * (1 + ratio / 100))
    const installmentAmount = Math.ceil(totalRepayment / installments)
    return { totalRepayment, installmentAmount, ratio }
}
