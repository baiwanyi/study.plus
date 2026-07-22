import { query, execute } from './db'
import { HttpError } from './errors'

/**
 * 【安全设计说明】频率限制：防止非 AI 接口被脚本刷爆、造成账单失控或资源耗尽。
 * 为简化实现，复用 ai_usage_logs 表做操作日志记录（写入频率低，不影响主业务表）。
 * 生产环境建议使用独立计数器或 Redis 计数器。
 */

const WRITE_LIMIT_PER_MINUTE = 60
const READ_LIMIT_PER_MINUTE = 200

/** 检查用户的分钟级写操作频率，超限则拒绝 */
export async function assertWriteRateLimit(userId: number): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const rows = await query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ai_usage_logs
         WHERE user_id = ? AND created_at >= ?`,
        [userId, oneMinuteAgo],
    )
    const count = rows[0]?.count ?? 0
    if (count > WRITE_LIMIT_PER_MINUTE) {
        throw new HttpError(429, '请求过于频繁，请稍后再试')
    }
}

/** 检查用户的分钟级读操作频率，超限则拒绝 */
export async function assertReadRateLimit(userId: number): Promise<void> {
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const rows = await query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ai_usage_logs
         WHERE user_id = ? AND created_at >= ?`,
        [userId, oneMinuteAgo],
    )
    const count = rows[0]?.count ?? 0
    if (count > READ_LIMIT_PER_MINUTE) {
        throw new HttpError(429, '请求过于频繁，请稍后再试')
    }
}
