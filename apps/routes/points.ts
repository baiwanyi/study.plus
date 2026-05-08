import { Router, type Request, type Response } from 'express'
import { db } from '@apps/db/index'
import { pointRecords, exchanges } from '@apps/db/schema'
import { eq, ne, desc, and, gte, lte, notLike, sql } from 'drizzle-orm'
import { getPointsForGrade, getPointsForExamScore } from '@apps/services/points'
import { loadRules } from '@apps/routes/rules-loader'
import { recomputeMonthSummary } from '@apps/routes/summary-helper'
import type {
    PointRecord,
    CreatePointRecordRequest,
    PointStats,
    PointRecordType,
    RelatedType,
    ApiErrorResponse,
} from '@apps/lib/types'

const router = Router()

// Get point records with filters
router.get(
    '/',
    async (req: Request, res: Response<PointRecord[] | ApiErrorResponse>) => {
        try {
            const { type, month, relatedType } = req.query as {
                type?: PointRecordType
                month?: string
                relatedType?: RelatedType
            }
            const conditions = []

            if (type) conditions.push(eq(pointRecords.type, type))
            if (relatedType)
                conditions.push(eq(pointRecords.relatedType, relatedType))
            if (month) {
                const startDate = new Date(`${month}-01T00:00:00.000Z`)
                // Calculate correct end of month
                const endDate = new Date(startDate)
                endDate.setUTCMonth(endDate.getUTCMonth() + 1)
                endDate.setUTCDate(0) // Last day of the month
                endDate.setUTCHours(23, 59, 59, 999)
                const start = startDate.toISOString()
                const end = endDate.toISOString()
                conditions.push(gte(pointRecords.createdAt, start))
                conditions.push(lte(pointRecords.createdAt, end))
            }

            conditions.push(notLike(pointRecords.ruleName, 'exchangeRates%'))

            const records: PointRecord[] = (await db
                .select()
                .from(pointRecords)
                .where(and(...conditions))
                .orderBy(desc(pointRecords.createdAt))) as PointRecord[]

            res.json(records)
        } catch (err) {
            console.error('Error in GET /points:', err)
            res.status(500).json({
                error: 'Internal server error',
            } as ApiErrorResponse)
        }
    },
)

// Create a point record (manual earn/deduct)
router.post(
    '/',
    async (
        req: Request<
            {},
            PointRecord | ApiErrorResponse,
            CreatePointRecordRequest
        >,
        res: Response<PointRecord | ApiErrorResponse>,
    ) => {
        const {
            type,
            amount,
            reason,
            ruleName,
            relatedId,
            relatedType,
        }: CreatePointRecordRequest = req.body
        if (!type || amount === undefined || amount === null || !reason) {
            res.status(400).json({
                error: 'type、amount 和 reason 为必填项',
            })
            return
        }
        const result = await db
            .insert(pointRecords)
            .values({ type, amount, reason, ruleName, relatedId, relatedType })
            .returning()
        await recomputeMonthSummary(new Date().toISOString().slice(0, 7))
        res.json(result[0] as PointRecord)
    },
)

// Create a point record by grade (auto-calculates amount from rules)
router.post(
    '/by-grade',
    async (
        req: Request<
            {},
            PointRecord | ApiErrorResponse,
            {
                category: string
                grade: string
                remark?: string
                relatedId?: string
            }
        >,
        res: Response<PointRecord | ApiErrorResponse>,
    ) => {
        const { category, grade, remark, relatedId } = req.body
        if (!category || !grade) {
            res.status(400).json({ error: 'category 和 grade 为必填项' })
            return
        }

        // Validate grade exists in rules
        const rules = await loadRules()
        const points = getPointsForGrade(rules, grade)
        if (points === 0) {
            const validGrades = rules.gradingScale.homework.map((g) => g.grade)
            res.status(400).json({
                error: `无效的等级 "${grade}"，有效值为: ${validGrades.join(', ')}`,
            })
            return
        }

        const categoryLabel =
            category === 'submission'
                ? '作业批改'
                : category === 'exam'
                  ? '单元测评'
                  : category

        const recordType = points >= 0 ? 'earn' : 'deduct'
        const reason = `${categoryLabel} - ${grade}${remark ? `（${remark}）` : ''}`

        const result = await db
            .insert(pointRecords)
            .values({
                type: recordType,
                amount: Math.abs(points),
                reason,
                ruleName: `${categoryLabel}-${grade}`,
                relatedType: category as RelatedType,
                relatedId: relatedId ? Number(relatedId) : null,
            })
            .returning()
        await recomputeMonthSummary(new Date().toISOString().slice(0, 7))
        res.json(result[0] as PointRecord)
    },
)

// Create a point record by exam score (auto-calculates amount from exam score rules)
router.post(
    '/by-exam-score',
    async (
        req: Request<
            {},
            PointRecord | ApiErrorResponse,
            { score: number; remark?: string; relatedId?: string }
        >,
        res: Response<PointRecord | ApiErrorResponse>,
    ) => {
        const { score, remark, relatedId } = req.body
        if (score === undefined || score === null) {
            res.status(400).json({ error: 'score 为必填项' })
            return
        }

        const numScore = Number(score)
        if (isNaN(numScore)) {
            res.status(400).json({ error: 'score 必须为数字' })
            return
        }

        // Validate score range (0-100)
        if (numScore < 0 || numScore > 100) {
            res.status(400).json({ error: 'score 必须在 0-100 之间' })
            return
        }

        // Load rules
        const rules = await loadRules()

        const matched = getPointsForExamScore(rules, numScore)
        if (!matched) {
            res.status(400).json({
                error: `未找到分数 ${numScore} 对应的积分规则`,
            })
            return
        }

        const points = matched.points
        const recordType = points >= 0 ? 'earn' : 'deduct'
        const reason = `单元测评 - ${numScore}分${remark ? `（${remark}）` : ''}`
        const ruleName = `${matched.min}-${matched.max}分`

        const result = await db
            .insert(pointRecords)
            .values({
                type: recordType,
                amount: Math.abs(points),
                reason,
                ruleName,
                relatedType: 'exam' as RelatedType,
                relatedId: relatedId ? Number(relatedId) : null,
            })
            .returning()
        await recomputeMonthSummary(new Date().toISOString().slice(0, 7))
        res.json(result[0] as PointRecord)
    },
)

// Create a point record by custom rule
router.post(
    '/by-custom-rule',
    async (
        req: Request<
            {},
            PointRecord | ApiErrorResponse,
            { ruleId: string; remark?: string; relatedId?: string }
        >,
        res: Response<PointRecord | ApiErrorResponse>,
    ) => {
        const { ruleId, remark, relatedId } = req.body
        if (!ruleId) {
            res.status(400).json({ error: 'ruleId 为必填项' })
            return
        }
        // Validate relatedId if provided
        if (
            relatedId !== undefined &&
            relatedId !== null &&
            isNaN(Number(relatedId))
        ) {
            res.status(400).json({ error: 'relatedId 必须为有效数字' })
            return
        }

        const rules = await loadRules()
        // First try to match by id, then by name
        let customRule = rules.customRules.find((r) => r.id === ruleId)
        if (!customRule) {
            customRule = rules.customRules.find((r) => r.name === ruleId)
        }
        if (!customRule) {
            const availableRules = rules.customRules
                .map((r) => r.name)
                .join(', ')
            res.status(404).json({
                error: `自定义规则不存在，可用的规则有: ${availableRules || '无'}`,
            })
            return
        }

        const recordType: PointRecordType =
            customRule.type === 'earn' ? 'earn' : 'deduct'
        const reason = customRule.description
            ? `${customRule.name} - ${customRule.description}${remark ? `（${remark}）` : ''}`
            : `${customRule.name}${remark ? `（${remark}）` : ''}`

        try {
            const result = await db
                .insert(pointRecords)
                .values({
                    type: recordType,
                    amount: customRule.points,
                    reason,
                    ruleName: customRule.name,
                    relatedType: 'custom' as RelatedType,
                    relatedId: relatedId ? Number(relatedId) : null,
                })
                .returning()
            await recomputeMonthSummary(new Date().toISOString().slice(0, 7))
            res.json(result[0] as PointRecord)
        } catch (err) {
            console.error('Error in POST /points/by-custom-rule:', err)
            res.status(500).json({
                error: '服务器内部错误',
            } as ApiErrorResponse)
        }
    },
)

// Get monthly summary (dynamically computed from pointRecords)
router.get('/summary', async (req: Request, res: Response) => {
    const { month } = req.query as { month?: string }
    const targetMonth: string = month || new Date().toISOString().slice(0, 7)
    const summary = await recomputeMonthSummary(targetMonth)
    res.json(summary)
})

// Calculate monthly stats
router.get(
    '/stats',
    async (req: Request, res: Response<PointStats | ApiErrorResponse>) => {
        try {
            const { month } = req.query as { month?: string }
            const targetMonth: string =
                month || new Date().toISOString().slice(0, 7)
            const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`)
            const endDate = new Date(startDate)
            endDate.setUTCMonth(endDate.getUTCMonth() + 1)
            endDate.setUTCDate(0)
            endDate.setUTCHours(23, 59, 59, 999)
            const start = startDate.toISOString()
            const end = endDate.toISOString()

            const earnResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'earn'),
                        ne(pointRecords.relatedType, 'revoked'),
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            const deductResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'deduct'),
                        ne(pointRecords.relatedType, 'revoked'),
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            const totalEarn: number = Number(earnResult[0]?.total) || 0
            const totalDeduct: number = Number(deductResult[0]?.total) || 0

            // Count exchanges with status='active' in this month
            const exchangesResult = await db
                .select({
                    total: sql`COALESCE(SUM(${exchanges.pointsCost}), 0)`,
                })
                .from(exchanges)
                .where(
                    and(
                        eq(exchanges.status, 'active'),
                        gte(exchanges.createdAt, start),
                        lte(exchanges.createdAt, end),
                    ),
                )
            const totalExchanges: number =
                Number(exchangesResult[0]?.total) || 0
            res.json({
                month: targetMonth,
                totalEarn,
                totalDeduct,
                totalExchanges,
                net: totalEarn - totalDeduct + totalExchanges,
            })
        } catch (err) {
            console.error('Error in GET /points/stats:', err)
            res.status(500).json({
                error: '服务器内部错误',
            } as ApiErrorResponse)
        }
    },
)

export default router
