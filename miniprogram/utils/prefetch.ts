/**
 * 【预缓存管理器】应用启动时预取关键数据到本地缓存。
 *
 * 策略：
 * 1. 用户登录后触发，静默预取不必等待完成（不阻塞 UI）
 * 2. 预取完成后，后续页面 onShow 读取缓存即命中
 * 3. 按优先级分组并行拉取，低优先级出错不影响高优先级
 */

import { getCurrentUser, getCurrentChildId } from './auth'
import { callCloudFunction } from './api'

/**
 * 应用启动时预缓存基础数据。
 * 在 app.ts onLaunch 或登录成功后调用。
 */
export function prefetchOnStart(): void {
    // 未登录不预取
    if (!getCurrentUser()) return

    // 高优先级：仪表盘和积分页的摘要数据
    prefetchSummary()
        // 中优先级：低频基础设施
        .then(() => prefetchInfrastructure())
        .catch(() => { /* 静默失败，不阻塞页面加载 */ })
}

/** 预取积分摘要和统计（高优先级） */
async function prefetchSummary(): Promise<void> {
    const childId = getCurrentChildId()
    const suffix = childId ? `uid_${childId}` : undefined

    await Promise.allSettled([
        callCloudFunction('points', { action: 'summary' }, {
            ttlMs: 5 * 60 * 1000,
            keySuffix: suffix,
        }),
        callCloudFunction('points', { action: 'stats' }, {
            ttlMs: 5 * 60 * 1000,
            keySuffix: suffix,
        }),
    ])
}

/** 预取分类列表和系统选项等低频数据（中优先级） */
async function prefetchInfrastructure(): Promise<void> {
    await Promise.allSettled([
        callCloudFunction('categories', { action: 'list' }, {
            ttlMs: 30 * 60 * 1000,
        }),
    ])
}

/**
 * 切换孩子时预取新孩子的摘要数据。
 * 在 child-selector 选择孩子后调用。
 */
export function prefetchOnChildSwitch(): void {
    prefetchSummary().catch(() => {})
}
