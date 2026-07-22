import { run } from '../common/entry'
import { getAuthContext } from '../common/db-query'
import { aggregateShareStats, computeShareStats } from '../common/share-stats'
import { HttpError } from '../common/errors'

interface ShareStatsEvent {
    token?: string
    childId?: number
    month?: string
}

export async function main(event: ShareStatsEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const month = event.month || new Date().toISOString().slice(0, 7)
        if (!/^\d{4}-\d{2}$/.test(month)) {
            throw new HttpError(400, 'month 格式应为 YYYY-MM')
        }
        if (ctx.targetUserId != null) {
            return computeShareStats(ctx.targetUserId, month)
        }
        return aggregateShareStats(ctx.auth.userId, month)
    })
}
