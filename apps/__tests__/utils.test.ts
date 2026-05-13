import { describe, it, expect } from 'vitest'
import {
    formatDate,
    formatNumber,
    toTaskType,
    toPointType,
    toPointSymbol,
    getCurrentMonth,
    paginate,
    formatErrorMessage,
} from '@apps/lib/utils'

describe('formatDate', () => {
    it('应格式化 ISO 日期为中文格式', () => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        // Use a noon UTC time to test timezone-independently
        const result = formatDate('2026-05-13T12:00:00.000Z')
        expect(result).toContain('2026年05月13日')
        expect(result).toMatch(/\d{2}:\d{2}$/)
    })

    it('null 应返回 "-"', () => {
        expect(formatDate(null)).toBe('-')
    })

    it('空字符串应返回 "-"', () => {
        expect(formatDate('')).toBe('-')
    })
})

describe('formatNumber', () => {
    it('应格式化数字为带千分位格式', () => {
        expect(formatNumber(1234567)).toBe('1,234,567')
    })

    it('应格式化 0', () => {
        expect(formatNumber(0)).toBe('0')
    })

    it('应处理负数', () => {
        expect(formatNumber(-1000)).toBe('-1,000')
    })
})

describe('toTaskType', () => {
    it('应返回有效的 taskType', () => {
        expect(toTaskType('composition')).toBe('composition')
        expect(toTaskType('mindmap')).toBe('mindmap')
        expect(toTaskType('notes')).toBe('notes')
    })

    it('null 应返回默认值 "composition"', () => {
        expect(toTaskType(null)).toBe('composition')
    })

    it('undefined 应返回默认值 "composition"', () => {
        expect(toTaskType(undefined)).toBe('composition')
    })

    it('无效值应返回默认值 "composition"', () => {
        expect(toTaskType('invalid')).toBe('composition')
    })
})

describe('toPointType', () => {
    it('正数应返回 "text-success"', () => {
        expect(toPointType(10)).toBe('text-success')
        expect(toPointType(0)).toBe('text-success')
    })

    it('负数应返回 "text-danger"', () => {
        expect(toPointType(-10)).toBe('text-danger')
    })
})

describe('toPointSymbol', () => {
    it('正数应返回 "+"', () => {
        expect(toPointSymbol(10)).toBe('+')
        expect(toPointSymbol(0)).toBe('+')
    })

    it('负数应返回 "-"', () => {
        expect(toPointSymbol(-10)).toBe('-')
    })
})

describe('getCurrentMonth', () => {
    it('应返回 YYYY-MM 格式', () => {
        const result = getCurrentMonth()
        expect(result).toMatch(/^\d{4}-\d{2}$/)
    })
})

describe('paginate', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    it('第 1 页应返回前 5 项', () => {
        expect(paginate(items, 1, 5)).toEqual([1, 2, 3, 4, 5])
    })

    it('第 2 页应返回后 5 项', () => {
        expect(paginate(items, 2, 5)).toEqual([6, 7, 8, 9, 10])
    })

    it('超出范围的页码应返回空数组', () => {
        expect(paginate(items, 10, 5)).toEqual([])
    })

    it('页码小于 1 应自动修正为 1', () => {
        expect(paginate(items, 0, 5)).toEqual([1, 2, 3, 4, 5])
    })

    it('边界值：正好一页', () => {
        expect(paginate(items, 1, 10)).toEqual(items)
    })
})

describe('formatErrorMessage', () => {
    it('Error 对象应返回 message', () => {
        expect(formatErrorMessage(new Error('测试错误'))).toBe('测试错误')
    })

    it('字符串应返回 "未知错误"', () => {
        expect(formatErrorMessage('some error')).toBe('未知错误')
    })

    it('null 应返回 "未知错误"', () => {
        expect(formatErrorMessage(null)).toBe('未知错误')
    })
})
