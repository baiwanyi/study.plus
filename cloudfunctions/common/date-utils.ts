/**
 * 公共日期工具函数
 * 提取各处重复的 monthRange 实现，统一维护
 */

/** 根据月份字符串（YYYY-MM）计算该月的起止时间 */
export function monthRange(month: string): { start: string; end: string } {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    end.setUTCDate(0)
    end.setUTCHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
}
