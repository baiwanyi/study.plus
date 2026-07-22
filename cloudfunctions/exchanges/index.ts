import type { ExchangeRow } from '../common/types'
import { query, execute, insertAndGetId, withTransaction } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'
import { loadRules } from '../common/rules'
import { recomputeMonthSummary } from '../common/summary-helper'
import { monthRange } from '../common/date-utils'

interface ExchangesEvent {
    token?: string
    childId?: number
    action: 'list' | 'create' | 'revoke'
    id?: number
    itemType?: string
    pointsCost?: number
    status?: string
    month?: string
    page?: number
    pageSize?: number
}

export async function main(event: ExchangesEvent): Promise<unknown> {
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
            const { page, pageSize } = event
            const limit = Math.min(200, Math.max(1, Number(pageSize) || 50))
            const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit)
            const records = await query<ExchangeRow>(
                `SELECT * FROM exchanges WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset],
            )
            return { items: records, page: offset / limit + 1, pageSize: limit }
        }

        if (event.action === 'create') {
            return withTransaction(async (tx) => {
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

                const id = await tx.insertAndGetId(
                    `INSERT INTO exchanges (user_id, item_type, points_cost, detail)
             VALUES (?, ?, ?, ?)`,
                    [userId, itemType, pointsCost, detail],
                )
                await tx.execute(
                    `INSERT INTO point_records
             (user_id, type, amount, reason, rule_name, related_id, related_type)
             VALUES (?, 'deduct', ?, ?, ?, ?, 'exchange')`,
                    [userId, pointsCost, `兑换${itemLabel} ${detail}`, `exchangeRates.${itemType}`, id],
                )
                await recomputeMonthSummary(userId, currentMonth)

                const rows = await query<ExchangeRow>('SELECT * FROM exchanges WHERE id = ?', [id])
                return rows[0]
            })
        }

        if (event.action === 'revoke') {
            return withTransaction(async (tx) => {
                const id = Number(event.id)
                if (!Number.isInteger(id) || id <= 0) {
                    throw new HttpError(400, '无效的兑换 id')
                }
                const rows = await tx.query<ExchangeRow>(
                    'SELECT * FROM exchanges WHERE id = ? AND user_id = ? FOR UPDATE',
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

                const currentMonth = new Date().toISOString().slice(0, 7)
                await tx.execute(
                    `UPDATE month_summary SET balance = balance + ?, base_points = base_points + ?
               WHERE user_id = ? AND month = ?`,
                    [exchange.points_cost, exchange.points_cost, userId, currentMonth],
                )
                await tx.execute(
                    `UPDATE point_records SET related_type = 'revoked'
               WHERE related_id = ? AND related_type = 'exchange' AND user_id = ?`,
                    [id, userId],
                )
                await tx.execute(
                    `INSERT INTO point_records
               (user_id, type, amount, reason, rule_name, related_id, related_type)
               VALUES (?, 'earn', ?, ?, 'exchangeRevoked', ?, 'revoked')`,
                    [userId, exchange.points_cost, `撤销兑换${itemLabel} ${exchange.detail}`, id],
                )
                await tx.execute(
                    "UPDATE exchanges SET status = 'revoked' WHERE id = ? AND user_id = ?",
                    [id, userId],
                )
                return { success: true }
            })
        }

        throw new HttpError(400, '未知的 action')
    })
}
