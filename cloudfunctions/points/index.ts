import type {
    PointRecordRow,
    PointRecordType,
    RelatedType,
} from '../common/types'
import { listChildren } from '../common/children'
import { query, execute } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'
import { loadRules, pointsForHomeworkGrade, pointsForExamScore } from '../common/rules'
import { aggregateShareStats, computeShareStats } from '../common/share-stats'
import { recomputeMonthSummary } from '../common/summary-helper'
import { monthRange } from '../common/date-utils'

interface PointsEvent {
    token?: string
    childId?: number
    action:
        | 'list'
        | 'create'
        | 'by-grade'
        | 'by-exam-score'
        | 'by-custom-rule'
        | 'summary'
        | 'stats'
        | 'available-months'
        | 'share-stats'
    type?: string
    month?: string
    relatedType?: string
    amount?: number
    reason?: string
    ruleName?: string
    relatedId?: number | string
    category?: string
    grade?: string
    remark?: string
    score?: number
    ruleId?: string
    status?: string
    installments?: number
    page?: number
    pageSize?: number
}

async function aggregateSummary(
    parentId: number,
    month: string,
): Promise<Record<string, number | string>> {
    const children = await listChildren(parentId)
    const summaries = await Promise.all(
        children.map((c) => recomputeMonthSummary(c.childId, month)),
    )
    const rules = await loadRules()
    return {
        month,
        basePoints: summaries.reduce((s, x) => s + x.basePoints, 0),
        totalEarn: summaries.reduce((s, x) => s + x.totalEarn, 0),
        totalDeduct: summaries.reduce((s, x) => s + x.totalDeduct, 0),
        totalExchanges: summaries.reduce((s, x) => s + x.totalExchanges, 0),
        balance: summaries.reduce((s, x) => s + x.balance, 0),
        availableBalance: summaries.reduce((s, x) => s + x.availableBalance, 0),
        minimumPointsForPrivileges: rules.minimumPointsForPrivileges,
        monthlyBasePoints: summaries.reduce((s, x) => s + x.monthlyBasePoints, 0),
    }
}

export async function main(event: PointsEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const { type, month, relatedType, page, pageSize } = event
            const where: string[] = [`(${ctx.userFilter})`, "related_type <> 'exchange'"]
            const params: unknown[] = []
            if (type) {
                where.push('type = ?')
                params.push(type)
            }
            if (relatedType) {
                where.push('related_type = ?')
                params.push(relatedType)
            }
            if (month) {
                const { start, end } = monthRange(month)
                where.push('created_at >= ? AND created_at <= ?')
                params.push(start, end)
            }
            const limit = Math.min(200, Math.max(1, Number(pageSize) || 50))
            const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit)
            const records = await query<PointRecordRow>(
                `SELECT * FROM point_records WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset],
            )
            return { items: records, page: offset / limit + 1, pageSize: limit }
        }

        if (action === 'create') {
            const userId = requireTargetUser(ctx)
            const { type, amount, reason, ruleName, relatedId, relatedType } = event
            if (!type || amount === undefined || amount === null || !reason) {
                throw new HttpError(400, 'type、amount 和 reason 为必填项')
            }
            if (typeof amount !== 'number' || !Number.isFinite(amount)) {
                throw new HttpError(400, 'amount 必须为有效数字')
            }
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_id, related_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    type,
                    amount,
                    reason,
                    ruleName ?? null,
                    relatedId != null ? Number(relatedId) : null,
                    relatedType ?? null,
                ],
            )
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
            return { success: true }
        }

        if (action === 'by-grade') {
            const userId = requireTargetUser(ctx)
            const { category, grade, remark, relatedId } = event
            if (!category || !grade) {
                throw new HttpError(400, 'category 和 grade 为必填项')
            }
            if (relatedId != null && isNaN(Number(relatedId))) {
                throw new HttpError(400, 'relatedId 必须为有效数字')
            }
            const rules = await loadRules()
            const points = pointsForHomeworkGrade(rules, grade)
            if (points === 0) {
                const valid = rules.homework.map((g) => g.grade).join(', ')
                throw new HttpError(400, `无效的等级 "${grade}"，有效值为: ${valid}`)
            }
            const categoryLabel =
                category === 'submission' ? '作业批改' : category === 'exam' ? '单元测评' : category
            const recordType: PointRecordType = points >= 0 ? 'earn' : 'deduct'
            const reason = `${categoryLabel} - ${grade}${remark ? `（${remark}）` : ''}`
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_type, related_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    recordType,
                    Math.abs(points),
                    reason,
                    `${categoryLabel}-${grade}`,
                    category as RelatedType,
                    relatedId != null ? Number(relatedId) : null,
                ],
            )
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
            return { success: true }
        }

        if (action === 'by-exam-score') {
            const userId = requireTargetUser(ctx)
            const { score, remark, relatedId } = event
            if (score === undefined || score === null) {
                throw new HttpError(400, 'score 为必填项')
            }
            if (relatedId != null && isNaN(Number(relatedId))) {
                throw new HttpError(400, 'relatedId 必须为有效数字')
            }
            const numScore = Number(score)
            if (isNaN(numScore) || numScore < 0 || numScore > 100) {
                throw new HttpError(400, 'score 必须为 0-100 的数字')
            }
            const rules = await loadRules()
            const matched = pointsForExamScore(rules, numScore)
            if (!matched) {
                throw new HttpError(400, `未找到分数 ${numScore} 对应的积分规则`)
            }
            const recordType: PointRecordType = matched.points >= 0 ? 'earn' : 'deduct'
            const reason = `单元测评 - ${numScore}分${remark ? `（${remark}）` : ''}`
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_type, related_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    recordType,
                    Math.abs(matched.points),
                    reason,
                    `${matched.min}-${matched.max}分`,
                    'exam' as RelatedType,
                    relatedId != null ? Number(relatedId) : null,
                ],
            )
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
            return { success: true }
        }

        if (action === 'by-custom-rule') {
            const userId = requireTargetUser(ctx)
            const { ruleId, remark, relatedId } = event
            if (!ruleId) throw new HttpError(400, 'ruleId 为必填项')
            if (relatedId != null && isNaN(Number(relatedId))) {
                throw new HttpError(400, 'relatedId 必须为有效数字')
            }
            const rules = await loadRules()
            let customRule = rules.custom.find((r) => r.id === ruleId)
            if (!customRule) {
                customRule = rules.custom.find((r) => r.name === ruleId)
            }
            if (!customRule) {
                const available = rules.custom.map((r) => r.name).join(', ')
                throw new HttpError(404, `自定义规则不存在，可用的规则有: ${available || '无'}`)
            }
            const recordType: PointRecordType = customRule.type === 'earn' ? 'earn' : 'deduct'
            const reason = customRule.description
                ? `${customRule.name} - ${customRule.description}${remark ? `（${remark}）` : ''}`
                : `${customRule.name}${remark ? `（${remark}）` : ''}`
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_type, related_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    recordType,
                    customRule.points,
                    reason,
                    customRule.name,
                    'custom' as RelatedType,
                    relatedId != null ? Number(relatedId) : null,
                ],
            )
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
            return { success: true }
        }

        if (action === 'summary') {
            const month = event.month || new Date().toISOString().slice(0, 7)
            if (ctx.targetUserId != null) {
                return recomputeMonthSummary(ctx.targetUserId, month)
            }
            return aggregateSummary(ctx.auth.userId, month)
        }

        if (action === 'stats') {
            const month = event.month || new Date().toISOString().slice(0, 7)
            const { start, end } = monthRange(month)
            const [earn, deduct, exchanges] = await Promise.all([
                query<{ total: number }>(
                    `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
             WHERE (${ctx.userFilter}) AND type = 'earn' AND related_type <> 'revoked'
             AND created_at >= ? AND created_at <= ?`,
                    [start, end],
                ),
                query<{ total: number }>(
                    `SELECT COALESCE(SUM(amount),0) AS total FROM point_records
             WHERE (${ctx.userFilter}) AND type = 'deduct' AND related_type <> 'revoked'
             AND created_at >= ? AND created_at <= ?`,
                    [start, end],
                ),
                query<{ total: number }>(
                    `SELECT COALESCE(SUM(points_cost),0) AS total FROM exchanges
             WHERE (${ctx.userFilter}) AND status = 'active'
             AND created_at >= ? AND created_at <= ?`,
                    [start, end],
                ),
            ])
            const totalEarn = Number(earn[0]?.total) || 0
            const totalDeduct = Number(deduct[0]?.total) || 0
            return {
                month,
                totalEarn,
                totalDeduct,
                totalExchanges: Number(exchanges[0]?.total) || 0,
                net: totalEarn - totalDeduct,
            }
        }

        if (action === 'available-months') {
            const rows = await query<{ month: string }>(
                `SELECT DISTINCT month FROM month_summary WHERE (${ctx.userFilter}) ORDER BY month DESC`,
            )
            return rows.map((r) => r.month)
        }

        if (action === 'share-stats') {
            const month = event.month || new Date().toISOString().slice(0, 7)
            if (ctx.targetUserId != null) {
                return computeShareStats(ctx.targetUserId, month)
            }
            return aggregateShareStats(ctx.auth.userId, month)
        }

        throw new HttpError(400, '未知的 action')
    })
}
