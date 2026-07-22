import { getToken, getCurrentChildId } from './auth'
import { getCache, setCache, invalidateByPrefix, cacheKey } from './cache'

export interface CallResult<T> {
    code: number
    data?: T
    error?: boolean
    message?: string
}

/** 缓存选项：启用缓存时传此参数 */
export interface CacheOptions {
    /** 缓存 TTL（毫秒），不传则不缓存 */
    ttlMs?: number
    /** 自定义缓存键后缀（默认为 action 值） */
    keySuffix?: string
}

/** 默认的缓存键前缀 -> TTL 映射 */
const DEFAULT_CACHE_CONFIG: Record<string, number> = {
    categories_list: 30 * 60 * 1000,    // 分类：30分钟
    points_summary: 5 * 60 * 1000,      // 积分汇总：5分钟
    points_stats: 5 * 60 * 1000,         // 积分统计：5分钟
    points_list: 3 * 60 * 1000,          // 积分流水：3分钟
    tasks_list: 3 * 60 * 1000,           // 作业列表：3分钟
    weekly_list: 3 * 60 * 1000,          // 周报列表：3分钟
    studynotes_list: 3 * 60 * 1000,      // 心得列表：3分钟
    exchanges_list: 3 * 60 * 1000,       // 兑换记录：3分钟
    advances_list: 3 * 60 * 1000,        // 预支记录：3分钟
    advances_summary: 5 * 60 * 1000,     // 预支汇总：5分钟
    'ai-usage_list': 5 * 60 * 1000,      // AI用量列表：5分钟
    'ai-usage_summary': 5 * 60 * 1000,   // AI用量汇总：5分钟
    'share-stats_': 5 * 60 * 1000,       // 分享统计：5分钟
    points_available-months: 10 * 60 * 1000, // 可用月份：10分钟
}

/** 获取云函数读操作的默认 TTL */
function getDefaultTtl(name: string, action: string): number | undefined {
    return DEFAULT_CACHE_CONFIG[`${name}_${action}`] ?? DEFAULT_CACHE_CONFIG[`${name}_`]
}

/** 判断是否为写操作（需清除缓存） */
const WRITE_ACTIONS = new Set([
    'create', 'update', 'delete', 'revoke', 'remove', 'add', 'set',
    'by-grade', 'by-exam-score', 'by-custom-rule',
    'repay', 'submit', 'evaluate', 'follow-up',
])

function isWriteAction(action: string): boolean {
    return WRITE_ACTIONS.has(action)
}

/** 写操作后清除对应云函数的所有缓存 */
function invalidateAfterWrite(name: string): void {
    invalidateByPrefix(name)
}

/**
 * 统一云函数调用封装：自动携带登录令牌与当前孩子 ID。
 * 支持缓存层：传 cacheOptions 启用，写操作自动失效相关缓存。
 */
export function callCloudFunction<T>(
    name: string,
    data: Record<string, unknown> = {},
    cacheOptions?: CacheOptions,
): Promise<T> {
    const token = getToken()
    const childId = getCurrentChildId()
    const action = (data.action as string) || ''
    const cacheKeyStr = cacheKey(name, action || 'noop', cacheOptions?.keySuffix)

    // 写操作：先清除缓存，再调用（确保后续读操作拿到最新数据）
    if (action && isWriteAction(action)) {
        invalidateAfterWrite(name)
    }

    // 读操作且启用了缓存：优先返回缓存数据
    const ttl = cacheOptions?.ttlMs ?? (getDefaultTtl(name, action))
    if (ttl && action && !isWriteAction(action)) {
        const cached = getCache<T>(cacheKeyStr)
        if (cached !== null) {
            return Promise.resolve(cached)
        }
    }

    return new Promise<T>((resolve, reject) => {
        wx.cloud.callFunction({
            name,
            data: {
                ...data,
                token: token || undefined,
                childId: childId ?? undefined,
            },
            success: (res) => {
                const result = res.result as CallResult<T> | undefined
                if (!result) {
                    reject(new Error('云函数返回空响应'))
                    return
                }
                if (result.code === 401) {
                    wx.removeStorageSync('loginToken')
                    wx.reLaunch({ url: '/pages/login/login' })
                    reject(new Error('登录已过期，请重新登录'))
                    return
                }
                if (result.error) {
                    reject(new Error(result.message || '请求失败'))
                    return
                }
                // 缓存读操作的结果
                if (ttl && action && !isWriteAction(action)) {
                    setCache(cacheKeyStr, result.data as T, ttl)
                }
                resolve(result.data as T)
            },
            fail: (err) => {
                reject(new Error(err.errMsg || '云函数调用失败'))
            },
        })
    })
}

/**
 * 带缓存刷新的调用：先展示缓存，后台拉取最新数据更新缓存。
 * 适用于列表页 onShow：用户看到旧数据不空白，等待新数据到达后更新 UI。
 */
export function callWithStaleRefresh<T>(
    name: string,
    data: Record<string, unknown> = {},
    onData: (data: T) => void,
    cacheOptions?: CacheOptions,
): Promise<void> {
    const action = (data.action as string) || ''
    const childId = getCurrentChildId()
    const keySuffix = cacheOptions?.keySuffix
    const cacheKeyStr = cacheKey(name, action || 'noop', keySuffix)
    const ttl = cacheOptions?.ttlMs ?? (getDefaultTtl(name, action))

    // 先展示缓存数据，避免白屏
    if (ttl && action && !isWriteAction(action)) {
        const cached = getCache<T>(cacheKeyStr)
        if (cached !== null) {
            onData(cached)
        }
    }

    // 后台拉取最新数据
    return callCloudFunction<T>(name, data, cacheOptions)
        .then((fresh) => {
            onData(fresh)
        })
        .catch((err) => {
            // 已有缓存数据时静默后台刷新失败
            if (!getCache<T>(cacheKeyStr)) {
                throw err
            }
            console.warn('[StaleRefresh] Background refresh failed:', err.message)
        })
}

/** 执行云函数操作并在成功后按模式清除缓存 */
export async function callAndInvalidate<T>(
    name: string,
    data: Record<string, unknown> = {},
): Promise<T> {
    const result = await callCloudFunction<T>(name, data)
    invalidateAfterWrite(name)
    return result
}
