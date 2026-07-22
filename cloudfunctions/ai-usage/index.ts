import { run } from '../common/entry'
import { query } from '../common/db'
import { getAuthContext } from '../common/db-query'
import { HttpError } from '../common/errors'
import type { AiUsageLogRow } from '../common/types'

interface AiUsageEvent {
    token?: string
    childId?: number
    action: 'list' | 'summary'
    project?: string
    limit?: number
}

export async function main(event: AiUsageEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (event.project) {
                where.push('project = ?')
                params.push(event.project)
            }
            const limit = Number(event.limit) || 50
            const logs = await query<AiUsageLogRow>(
                `SELECT id, user_id, project, task_id, task_title, prompt_tokens,
                    completion_tokens, total_tokens, created_at
                 FROM ai_usage_logs WHERE ${where.join(' AND ')}
                 ORDER BY created_at DESC LIMIT ?`,
                [...params, limit],
            )
            return logs
        }

        if (action === 'summary') {
            const rows = await query<{
                project: string
                count: number
                totalPromptTokens: number
                totalCompletionTokens: number
                totalTokens: number
            }>(
                `SELECT project,
                    COUNT(*) AS count,
                    SUM(prompt_tokens) AS totalPromptTokens,
                    SUM(completion_tokens) AS totalCompletionTokens,
                    SUM(total_tokens) AS totalTokens
                 FROM ai_usage_logs WHERE (${ctx.userFilter})
                 GROUP BY project ORDER BY totalTokens DESC`,
            )
            return rows
        }

        throw new HttpError(400, '未知的 action')
    })
}
