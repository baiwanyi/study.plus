import { run } from '../common/entry'
import { query, execute, insertAndGetId } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { HttpError } from '../common/errors'
import { loadRules } from '../common/rules'
import { recomputeMonthSummary } from '../common/summary-helper'
import type { ExchangeRow, ExchangeStatus } from '../common/types'

interface ExchangesEvent {
    token?: string
    childId?: number
    action: 'list' | 'create' | 'revoke'
    id?: number
    itemType?: string
    pointsCost?: number
    status?: string
    month?: string
}

function monthRange(month: string): { start: string; end: string } {
    const start = new Date(`${month}-01T00:00:00.000Z`)
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 1)
    end.setUTCDate(0)
    end.setUTCHours(23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
}

export async function main(event: ExchangesEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const userId = requireTargetUser(ctx)

        if (event.action === 'list') {
            const { itemType, month, status } = event
            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (itemType) {
                where.push('item_type = ?')
                params.push(itemType)
            }
            if (status) {
                where.push('status = ?')
                params.push(status)
            }
            if (month) {
                const { start, end } = monthRange(month)
                where.push('created_at >= ? AND created_at <= ?')
                params.push(start, end)
            }
            const records = await query<ExchangeRow>(
                `SELECT * FROM exchanges WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
                params,
            )
            return records
        }

        if (event.action === 'create') {
            const { itemType, pointsCost } = event
            if (!itemType || !pointsCost) {
                throw new HttpError(400, 'itemType 和 pointsCost 为必填项')
            }
            if (typeof pointsCost !== 'number' || pointsCost <= 0) {
                throw new HttpError(400, 'pointsCost 必须为正数')
            }

            const rules = await loadRules()
            const rate = rules.exchange.find((e) => e.key === itemType)
            const itemLabel = rate ? rate.label : itemType

            let detail = ''
            if (rate) {
                const quantity = (pointsCost / (rate.points || 1)) * rate.ratio
                detail = `${Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1)}${rate.unit}`
            }

            const currentMonth = new Date().toISOString().slice(0, 7)
            const summary = await recomputeMonthSummary(userId, currentMonth)
            if (summary.availableBalance < pointsCost) {
                throw new HttpError(400, '积分不足', { balance: summary.availableBalance })
            }

            const id = await insertAndGetId(
                `INSERT INTO exchanges (user_id, item_type, points_cost, detail)
         VALUES (?, ?, ?, ?)`,
                [userId, itemType, pointsCost, detail],
            )
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_id, related_type)
         VALUES (?, 'deduct', ?, ?, ?, ?, 'exchange')`,
                [userId, pointsCost, `兑换${itemLabel} ${detail}`, `exchangeRates.${itemType}`, id],
            )
            await recomputeMonthSummary(userId, currentMonth)

            const rows = await query<ExchangeRow>('SELECT * FROM exchanges WHERE id = ?', [id])
            return rows[0]
        }

        if (event.action === 'revoke') {
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的兑换 id')
            }
            const rows = await query<ExchangeRow>(
                'SELECT * FROM exchanges WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            const exchange = rows[0]
            if (!exchange) throw new HttpError(404, '兑换记录不存在')
            if (exchange.status === 'revoked') {
                throw new HttpError(400, '已撤销，不能重复撤销')
            }

            const rules = await loadRules()
            const rate = rules.exchange.find((e) => e.key === exchange.item_type)
            const itemLabel = rate ? rate.label : exchange.item_type

            try {
                const currentMonth = new Date().toISOString().slice(0, 7)
                await execute(
                    `UPDATE month_summary SET balance = balance + ?, base_points = base_points + ?
           WHERE user_id = ? AND month = ?`,
                    [exchange.points_cost, exchange.points_cost, userId, currentMonth],
                )
                await execute(
                    `UPDATE point_records SET related_type = 'revoked'
           WHERE related_id = ? AND related_type = 'exchange' AND user_id = ?`,
                    [id, userId],
                )
                await execute(
                    `INSERT INTO point_records
           (user_id, type, amount, reason, rule_name, related_id, related_type)
           VALUES (?, 'earn', ?, ?, 'exchangeRevoked', ?, 'revoked')`,
                    [userId, exchange.points_cost, `撤销兑换${itemLabel} ${exchange.detail}`, id],
                )
                await execute(
                    "UPDATE exchanges SET status = 'revoked' WHERE id = ? AND user_id = ?",
                    [id, userId],
                )
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.error('撤销兑换失败:', msg)
                throw new HttpError(500, '撤销失败，请重试')
            }
            return { success: true }
        }

        throw new HttpError(400, '未知的 action')
    })
}
