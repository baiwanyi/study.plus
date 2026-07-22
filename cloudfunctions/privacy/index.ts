import { run } from '../common/entry'
import { query, execute } from '../common/db'
import { getAuthContext } from '../common/db-query'
import { listChildren } from '../common/children'
import { HttpError } from '../common/errors'

interface PrivacyEvent {
    token?: string
    childId?: number
    action: 'export' | 'delete'
    confirm?: boolean
}

async function collectForUser(userId: number): Promise<Record<string, unknown[]>> {
    const tables = [
        'tasks',
        'submissions',
        'task_conversations',
        'point_records',
        'exchanges',
        'point_advances',
        'month_summary',
        'ai_score_logs',
        'ai_usage_logs',
        'weekly_reports',
        'weekly_conversations',
        'studynotes',
        'studynote_conversations',
    ]
    const result: Record<string, unknown[]> = {}
    for (const table of tables) {
        const rows = await query<Record<string, unknown>>(
            `SELECT * FROM ${table} WHERE user_id = ?`,
            [userId],
        )
        result[table] = rows
    }
    return result
}

export async function main(event: PrivacyEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'export') {
            const self = await query<Record<string, unknown>>(
                'SELECT id, nickname, role, created_at FROM users WHERE id = ?',
                [ctx.auth.userId],
            )
            const data: Record<string, unknown> = { user: self[0] ?? null }
            if (ctx.auth.role === 'parent') {
                const children = await listChildren(ctx.auth.userId)
                const childData = []
                for (const c of children) {
                    childData.push(await collectForUser(c.childId))
                }
                data.childrenData = childData
            } else {
                data.ownData = await collectForUser(ctx.auth.userId)
            }
            return data
        }

        if (action === 'delete') {
            if (!event.confirm) {
                throw new HttpError(400, '删除账户需显式确认（confirm=true）')
            }
            const targetIds =
                ctx.auth.role === 'parent'
                    ? [ctx.auth.userId, ...(await listChildren(ctx.auth.userId)).map((c) => c.childId)]
                    : [ctx.auth.userId]
            const placeholders = targetIds.map(() => '?').join(',')
            const tables = [
                'tasks',
                'submissions',
                'point_records',
                'exchanges',
                'point_advances',
                'month_summary',
                'ai_score_logs',
                'ai_usage_logs',
                'weekly_reports',
                'studynotes',
                'login_tokens',
            ]
            for (const table of tables) {
                await execute(`DELETE FROM ${table} WHERE user_id IN (${placeholders})`, targetIds)
            }
            // 删除用户与家庭绑定（级联清理会话等子表）
            await execute(`DELETE FROM users WHERE id IN (${placeholders})`, targetIds)
            return { success: true, deleted: targetIds.length }
        }

        throw new HttpError(400, '未知的 action')
    })
}
