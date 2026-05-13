import { Router, type Request, type Response } from 'express'
import { db } from '@apps/db/index'
import { pointRecords, exchanges, pointAdvances, monthSummary } from '@apps/db/schema'
import { eq, ne, desc, and, gte, lte, sql, inArray } from 'drizzle-orm'
import { getPointsForGrade, getPointsForExamScore } from '@apps/services/points'
import { loadRules } from '@apps/routes/rules-loader'
import { recomputeMonthSummary } from '@apps/routes/summary-helper'
import {
    loadSystemSettings,
    isFirstDayOfMonth,
} from '@apps/routes/advance-helper'
import type {
    PointRecord,
    CreatePointRecordRequest,
    PointStats,
    ShareStats,
    PointRecordType,
    RelatedType,
    ApiErrorResponse,
    PointAdvance,
    CreateAdvanceRequest,
    AdvanceSummary,
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

            conditions.push(ne(pointRecords.relatedType, 'exchange'))

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

// Get all available months from month_summary table
router.get(
    '/available-months',
    async (_req: Request, res: Response<string[] | ApiErrorResponse>) => {
        try {
            const rows = await db
                .select({ month: monthSummary.month })
                .from(monthSummary)
                .orderBy(desc(monthSummary.month))
            const months = rows.map((r) => r.month)
            res.json(months)
        } catch (err) {
            console.error('Error in GET /points/available-months:', err)
            res.status(500).json({
                error: '服务器内部错误',
            } as ApiErrorResponse)
        }
    },
)

// Share stats - aggregated data for the share page
router.get(
    '/share-stats',
    async (req: Request, res: Response<ShareStats | ApiErrorResponse>) => {
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

            // Load rules for exchange ratio
            const rules = await loadRules()
            const gameRate =
                rules.exchangeRates.game || rules.exchangeRates.games
            const gameDurationPerPoint = gameRate ? gameRate.ratio : 10
            const gamePointsPerDuration = gameRate ? gameRate.points : 1

            // 1. Game exchange info (total duration & longest day)
            const gameExchanges = await db
                .select({
                    pointsCost: exchanges.pointsCost,
                    createdAt: exchanges.createdAt,
                })
                .from(exchanges)
                .where(
                    and(
                        inArray(exchanges.itemType, ['game', 'games']),
                        eq(exchanges.status, 'active'),
                        gte(exchanges.createdAt, start),
                        lte(exchanges.createdAt, end),
                    ),
                )

            const dayDurationMap = new Map<string, number>()
            let totalDuration = 0
            for (const ex of gameExchanges) {
                const duration =
                    (ex.pointsCost * gameDurationPerPoint) /
                    gamePointsPerDuration
                totalDuration += duration
                const day = ex.createdAt.slice(0, 10)
                dayDurationMap.set(
                    day,
                    (dayDurationMap.get(day) || 0) + duration,
                )
            }

            let longestDay = ''
            let longestDayDuration = 0
            for (const [day, duration] of dayDurationMap) {
                if (duration > longestDayDuration) {
                    longestDay = day
                    longestDayDuration = duration
                }
            }

            // 2. Monthly earn & deduct (exclude exchange / revoked / advance)
            const earnExcludingResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'earn'),
                        ne(pointRecords.relatedType, 'exchange'),
                        ne(pointRecords.relatedType, 'revoked'),
                        sql`${pointRecords.reason} NOT LIKE '积分预支 - %'`,
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            const deductExcludingResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'deduct'),
                        ne(pointRecords.relatedType, 'exchange'),
                        ne(pointRecords.relatedType, 'revoked'),
                        sql`${pointRecords.reason} NOT LIKE '积分预支 - %'`,
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            // 3. Submission vs exam earn totals
            const submissionEarnResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'earn'),
                        eq(pointRecords.relatedType, 'submission'),
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            const examEarnResult = await db
                .select({
                    total: sql`COALESCE(SUM(${pointRecords.amount}), 0)`,
                })
                .from(pointRecords)
                .where(
                    and(
                        eq(pointRecords.type, 'earn'),
                        eq(pointRecords.relatedType, 'exam'),
                        gte(pointRecords.createdAt, start),
                        lte(pointRecords.createdAt, end),
                    ),
                )

            // 4. Monthly summary
            const summary = await recomputeMonthSummary(targetMonth)

            res.json({
                month: targetMonth,
                exchangeInfo: {
                    totalDuration,
                    longestDay: longestDay || '',
                    longestDayDuration,
                },
                monthlyEarnExcluding:
                    Number(earnExcludingResult[0]?.total) || 0,
                monthlyDeductExcluding:
                    Number(deductExcludingResult[0]?.total) || 0,
                submissionEarnTotal:
                    Number(submissionEarnResult[0]?.total) || 0,
                examEarnTotal: Number(examEarnResult[0]?.total) || 0,
                totalEarn: summary.totalEarn,
                totalDeduct: summary.totalDeduct,
                totalExchanges: summary.totalExchanges,
                balance: summary.balance,
                availableBalance: summary.availableBalance,
            })
        } catch (err) {
            console.error('Error in GET /points/share-stats:', err)
            res.status(500).json({
                error: '服务器内部错误',
            } as ApiErrorResponse)
        }
    },
)

// ===== Advance Routes =====

// GET /points/advances - List all advance records
router.get(
    '/advances',
    async (
        req: Request,
        res: Response<PointAdvance[] | ApiErrorResponse>,
    ) => {
        try {
            const rawStatus = req.query.status as string | undefined
            // Validate status enum
            if (rawStatus && rawStatus !== 'active' && rawStatus !== 'completed') {
                res.status(400).json({
                    error: `无效的状态值 "${rawStatus}"，仅支持 active 或 completed`,
                })
                return
            }
            const whereClause = rawStatus
                ? eq(pointAdvances.status, rawStatus as 'active' | 'completed')
                : undefined
            const records = (await db
                .select()
                .from(pointAdvances)
                .where(whereClause)
                .orderBy(desc(pointAdvances.createdAt))) as PointAdvance[]
            res.json(records)
        } catch (err) {
            console.error('Error in GET /points/advances:', err)
            res.status(500).json({ error: '服务器内部错误' })
        }
    },
)

// GET /points/advances/summary - Get advance summary stats
router.get(
    '/advances/summary',
    async (_req: Request, res: Response<AdvanceSummary | ApiErrorResponse>) => {
        try {
            const settings = await loadSystemSettings()
            const maxPendingAmount =
                settings.maxPendingAmount ?? 500
            const activeAdvances = (await db
                .select()
                .from(pointAdvances)
                .where(eq(pointAdvances.status, 'active'))) as PointAdvance[]

            let totalPendingRepayment = 0
            let currentInstallmentDue = 0
            let totalRemainingInstallments = 0

            for (const adv of activeAdvances) {
                const paid = adv.paidInstallments * adv.installmentAmount
                const remaining = adv.totalRepayment - paid
                totalPendingRepayment += remaining

                // Only count current installment if still active (has remaining installments)
                if (adv.paidInstallments < adv.installments) {
                    currentInstallmentDue += adv.installmentAmount
                    totalRemainingInstallments +=
                        adv.installments - adv.paidInstallments
                }
            }

            const remainingCredit = Math.max(
                0,
                maxPendingAmount - totalPendingRepayment,
            )

            res.json({
                totalPendingRepayment,
                currentInstallmentDue,
                totalRemainingInstallments,
                remainingCredit,
                maxPendingAmount,
            })
        } catch (err) {
            console.error('Error in GET /points/advances/summary:', err)
            res.status(500).json({ error: '服务器内部错误' })
        }
    },
)

// POST /points/advances - Create a new advance
router.post(
    '/advances',
    async (
        req: Request<
            {},
            PointAdvance | ApiErrorResponse,
            CreateAdvanceRequest
        >,
        res: Response<PointAdvance | ApiErrorResponse>,
    ) => {
        try {
            const { amount, installments } = req.body

            // Validate amount: must be a positive integer
            if (
                typeof amount !== 'number' ||
                !Number.isInteger(amount) ||
                amount <= 0
            ) {
                res.status(400).json({
                    error: '预支积分必须为正整数',
                })
                return
            }

            // Validate installments: must be one of the allowed tiers
            if (![1, 3, 6, 9, 12].includes(installments)) {
                res.status(400).json({
                    error: '期数仅支持 1/3/6/9/12 五个档位',
                })
                return
            }

            const settings = await loadSystemSettings()
            const maxPendingAmount = settings.maxPendingAmount ?? 500
            const baseRatio = settings.advanceRepayRatio ?? 16

            // Calculate ratio based on installment tier
            const tierIndex = [1, 3, 6, 9, 12].indexOf(installments)
            const ratio = baseRatio + tierIndex * 2

            // Calculate repayment: totalRepayment = round(amount * (1 + ratio / 100))
            const totalRepayment = Math.round(amount * (1 + ratio / 100))
            const installmentAmount = Math.ceil(
                totalRepayment / installments,
            )

            // Risk control: check pending amount
            const activeAdvances = (await db
                .select()
                .from(pointAdvances)
                .where(eq(pointAdvances.status, 'active'))) as PointAdvance[]

            let currentPending = 0
            for (const adv of activeAdvances) {
                currentPending +=
                    adv.totalRepayment -
                    adv.paidInstallments * adv.installmentAmount
            }

            if (currentPending + totalRepayment > maxPendingAmount) {
                res.status(400).json({
                    error: `预支失败：当前待还 ${currentPending} 积分，新增预支 ${totalRepayment} 积分后总额 ${currentPending + totalRepayment} 超过风控上限 ${maxPendingAmount} 积分`,
                })
                return
            }

            // Create advance record
            const result = await db
                .insert(pointAdvances)
                .values({
                    amount,
                    totalRepayment,
                    installments,
                    installmentAmount,
                })
                .returning()

            // Create point record for advance (earn)
            await db.insert(pointRecords).values({
                type: 'earn',
                amount,
                reason: `积分预支 - ${installments}期`,
                relatedId: result[0].id,
            })

            await recomputeMonthSummary(
                new Date().toISOString().slice(0, 7),
            )
            res.status(201).json(result[0] as PointAdvance)
        } catch (err) {
            console.error('Error in POST /points/advances:', err)
            res.status(500).json({ error: '服务器内部错误' })
        }
    },
)

// POST /points/advances/repay - Monthly repayment deduction
router.post(
    '/advances/repay',
    async (
        _req: Request,
        res: Response<{ success: boolean; repaid: number } | ApiErrorResponse>,
    ) => {
        try {
            if (!isFirstDayOfMonth()) {
                res.status(400).json({
                    error: '仅限每月 1 日执行还款',
                })
                return
            }

            const activeAdvances = (await db
                .select()
                .from(pointAdvances)
                .where(eq(pointAdvances.status, 'active'))) as PointAdvance[]

            let totalRepaid = 0

            for (const adv of activeAdvances) {
                if (adv.paidInstallments >= adv.installments) continue

                // Deduct installment from user's points
                const reason = `积分预支还款 - 第 ${adv.paidInstallments + 1}/${adv.installments} 期`

                await db.insert(pointRecords).values({
                    type: 'deduct',
                    amount: adv.installmentAmount,
                    reason,
                    relatedId: adv.id,
                })

                // Update paid installments
                const newPaid = adv.paidInstallments + 1
                const newStatus =
                    newPaid >= adv.installments ? 'completed' : 'active'

                await db
                    .update(pointAdvances)
                    .set({
                        paidInstallments: newPaid,
                        status: newStatus,
                    })
                    .where(eq(pointAdvances.id, adv.id))

                totalRepaid += adv.installmentAmount
            }

            if (totalRepaid > 0) {
                await recomputeMonthSummary(
                    new Date().toISOString().slice(0, 7),
                )
            }

            res.json({
                success: true,
                repaid: totalRepaid,
            })
        } catch (err) {
            console.error('Error in POST /points/advances/repay:', err)
            res.status(500).json({ error: '服务器内部错误' })
        }
    },
)

export default router
