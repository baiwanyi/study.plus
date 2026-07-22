/**
 * 【预缓存模块】小程序端 TTL 数据缓存
 *
 * 方案说明：
 * - 基于 wx.setStorageSync/wx.getStorageSync 实现持久化 TTL 缓存
 * - 读操作缓存到本地，写操作自动失效相关缓存
 * - 避免频繁网络请求，提升页面加载速度
 * - 缓存键统一前缀 'pc_' 便于管理和清理
 *
 * 缓存策略：
 * - 分类/规则等低频变更数据：30 分钟
 * - 积分统计/汇总等中等频率数据：5 分钟
 * - 列表数据：3 分钟（切换 tab 返回时可见）
 * - 写操作后自动清除相关页面的缓存键
 */

const CACHE_PREFIX = 'pc_'
// 各类型数据的默认 TTL（毫秒）
const TTL_CONFIG = {
    /** 分类/规则等低频基础设施 */
    INFRA: 30 * 60 * 1000,
    /** 积分汇总/统计等中等频率 */
    SUMMARY: 5 * 60 * 1000,
    /** 列表数据 */
    LIST: 3 * 60 * 1000,
} as const

interface CacheEntry<T> {
    data: T
    expiresAt: number
}

/** 获取已缓存数据，过期自动清理 */
export function getCache<T>(key: string): T | null {
    try {
        const raw = wx.getStorageSync(CACHE_PREFIX + key)
        if (!raw) return null
        const entry = raw as CacheEntry<T>
        if (Date.now() > entry.expiresAt) {
            wx.removeStorageSync(CACHE_PREFIX + key)
            return null
        }
        return entry.data
    } catch {
        return null
    }
}

/** 设置缓存（存储满时自动清理最旧缓存） */
export function setCache<T>(key: string, data: T, ttlMs = TTL_CONFIG.LIST): void {
    try {
        const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs }
        wx.setStorageSync(CACHE_PREFIX + key, entry)
    } catch {
        // 存储空间已满，尝试清理过期项后重试
        console.warn('[Cache] Storage full, cleaning expired entries')
        clearExpired()
        try {
            const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs }
            wx.setStorageSync(CACHE_PREFIX + key, entry)
        } catch { /* 仍失败则静默忽略 */ }
    }
}

/** 移除单个缓存项 */
export function removeCache(key: string): void {
    try {
        wx.removeStorageSync(CACHE_PREFIX + key)
    } catch { /* silent */ }
}

/** 根据前缀模式清除关联缓存，用于写操作后刷新 */
export function invalidateByPrefix(prefix: string): void {
    try {
        const info = wx.getStorageInfoSync()
        const target = CACHE_PREFIX + prefix
        for (const k of info.keys) {
            if (k.startsWith(target)) {
                wx.removeStorageSync(k)
            }
        }
    } catch { /* silent */ }
}

/** 清除所有过期的缓存项 */
export function clearExpired(): void {
    try {
        const info = wx.getStorageInfoSync()
        const now = Date.now()
        for (const k of info.keys) {
            if (!k.startsWith(CACHE_PREFIX)) continue
            try {
                const raw = wx.getStorageSync(k)
                if (raw && (raw as CacheEntry<unknown>).expiresAt <= now) {
                    wx.removeStorageSync(k)
                }
            } catch { /* silent */ }
        }
    } catch { /* silent */ }
}

/** 清除所有缓存（含未过期的） */
export function clearAll(): void {
    try {
        const info = wx.getStorageInfoSync()
        for (const k of info.keys) {
            if (k.startsWith(CACHE_PREFIX)) {
                wx.removeStorageSync(k)
            }
        }
    } catch { /* silent */ }
}

/** 获取缓存使用概况 */
export function getCacheReport(): string {
    try {
        const info = wx.getStorageInfoSync()
        const cacheKeys = info.keys.filter(k => k.startsWith(CACHE_PREFIX))
        return `缓存 ${cacheKeys.length} 项 / ${(info.currentSize / 1024).toFixed(1)}KB / 限额 ${(info.limitSize / 1024).toFixed(0)}KB`
    } catch {
        return '缓存状态未知'
    }
}

/** 生成数据隔离的缓存键 */
export function cacheKey(name: string, action: string, suffix?: string): string {
    const parts = [name, action]
    if (suffix) parts.push(suffix)
    return parts.join('_')
}

export { TTL_CONFIG }
