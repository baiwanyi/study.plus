import { describe, it, expect } from 'vitest'
import { calculateAdvanceRepayment, isFirstDayOfMonth } from '@apps/routes/advance-helper'

describe('calculateAdvanceRepayment', () => {
    it('应正确计算 1 期还款（免手续费档位）', () => {
        const result = calculateAdvanceRepayment(100, 1)
        // tierIndex=0 (第一个匹配), ratio=16
        // totalRepayment = 100 * (1 + 16/100) = 116
        // installmentAmount = ceil(116 / 1) = 116
        expect(result.ratio).toBe(16)
        expect(result.totalRepayment).toBe(116)
        expect(result.installmentAmount).toBe(116)
    })

    it('应正确计算 3 期还款', () => {
        const result = calculateAdvanceRepayment(100, 3)
        // tierIndex=1 (第二个匹配), ratio=18
        // totalRepayment = 100 * (1 + 18/100) = 118
        // installmentAmount = ceil(118 / 3) = ceil(39.33) = 40
        expect(result.ratio).toBe(18)
        expect(result.totalRepayment).toBe(118)
        expect(result.installmentAmount).toBe(40)
    })

    it('应正确计算 6 期还款', () => {
        const result = calculateAdvanceRepayment(200, 6)
        // tierIndex=2, ratio=20
        // totalRepayment = 200 * 1.20 = 240
        // installmentAmount = ceil(240 / 6) = 40
        expect(result.ratio).toBe(20)
        expect(result.totalRepayment).toBe(240)
        expect(result.installmentAmount).toBe(40)
    })

    it('应正确计算 9 期还款', () => {
        const result = calculateAdvanceRepayment(300, 9)
        // tierIndex=3, ratio=22
        // totalRepayment = 300 * 1.22 = 366
        // installmentAmount = ceil(366 / 9) = 41
        expect(result.ratio).toBe(22)
        expect(result.totalRepayment).toBe(366)
        expect(result.installmentAmount).toBe(41)
    })

    it('应正确计算 12 期还款', () => {
        const result = calculateAdvanceRepayment(500, 12)
        // tierIndex=4, ratio=24
        // totalRepayment = 500 * 1.24 = 620
        // installmentAmount = ceil(620 / 12) = ceil(51.67) = 52
        expect(result.ratio).toBe(24)
        expect(result.totalRepayment).toBe(620)
        expect(result.installmentAmount).toBe(52)
    })

    it('应支持自定义 baseRatio', () => {
        const result = calculateAdvanceRepayment(100, 3, 20)
        // baseRatio=20, tierIndex=1, ratio=20+2=22
        // totalRepayment = 100 * 1.22 = 122
        // installmentAmount = ceil(122 / 3) = 41
        expect(result.ratio).toBe(22)
        expect(result.totalRepayment).toBe(122)
        expect(result.installmentAmount).toBe(41)
    })

    it('对于未知分期数应使用默认 tierIndex=-1', () => {
        // installments=5 不在 [1,3,6,9,12] 中，indexOf 返回 -1
        // ratio = 16 + (-1)*2 = 14
        const result = calculateAdvanceRepayment(100, 5)
        expect(result.ratio).toBe(14)
        expect(result.totalRepayment).toBe(114)
        expect(result.installmentAmount).toBe(23) // ceil(114/5) = 23
    })

    it('应正确处理金额为 0 的情况', () => {
        const result = calculateAdvanceRepayment(0, 3)
        expect(result.totalRepayment).toBe(0)
        expect(result.installmentAmount).toBe(0)
    })
})

describe('isFirstDayOfMonth', () => {
    it('应返回布尔值', () => {
        const result = isFirstDayOfMonth()
        expect(typeof result).toBe('boolean')
    })
})
