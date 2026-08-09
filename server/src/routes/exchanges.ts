import { eq, desc, and, gte, lte } from 'drizzle-orm'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { db } from '../db/index'
import { exchanges, pointRecords } from '../db/schema'
import { loadRulesWithSrc, getExchangeItemLabel } from './rules-loader'
import { recomputeMonthSummary } from './summary-helper'
import type {
    Exchange,
    CreateExchangeRequest,
    RevokeExchangeResponse,
    ApiErrorResponse,
} from '@shared/types'

const router = Router()

const createExchangeSchema = z.object({
    itemType: z.string().min(1, '兑换项名称不能为空'),
    pointsCost: z.coerce
        .number()
        .int('兑换积分必须为整数')
        .positive('兑换积分必须为正数'),
})

const listQuerySchema = z.object({
    itemType: z.string().min(1).optional(),
    month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, 'month 格式应为 YYYY-MM')
        .optional(),
    status: z.enum(['active', 'revoked']).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
})

router.get('/', async (req: Request, res: Response<Exchange[] | ApiErrorResponse>) => {
    const parsed = listQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        res.status(400).json(parsed.error.issues[0]?.message as never)
        return
    }
    const { itemType, month, status, limit, offset } = parsed.data
    const conditions = []

    if (itemType) conditions.push(eq(exchanges.itemType, itemType))
    if (status) conditions.push(eq(exchanges.status, status))
    if (month) {
        const startDate = new Date(`${month}-01T00:00:00.000Z`)
        const endDate = new Date(startDate)
        endDate.setUTCMonth(endDate.getUTCMonth() + 1)
        endDate.setUTCDate(0)
        endDate.setUTCHours(23, 59, 59, 999)
        conditions.push(gte(exchanges.createdAt, startDate.toISOString()))
        conditions.push(lte(exchanges.createdAt, endDate.toISOString()))
    }

    // 分页：默认 50 条，上限 200，防止大表全量返回（性能）
    const pageLimit = limit ?? 50
    const pageOffset = offset ?? 0

    const records: Exchange[] = (await db
        .select()
        .from(exchanges)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(exchanges.createdAt))
        .limit(pageLimit)
        .offset(pageOffset)) as Exchange[]

    res.json(records)
})

router.post(
    '/',
    async (
        req: Request<{}, Exchange | ApiErrorResponse, CreateExchangeRequest>,
        res: Response<Exchange | ApiErrorResponse>,
    ) => {
        const parsed = createExchangeSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: parsed.error.issues[0]?.message ?? '请求参数无效',
            })
            return
        }
        const { itemType, pointsCost } = parsed.data

        try {
            const { rules, exchangeSrc } = await loadRulesWithSrc()

            const itemLabel = getExchangeItemLabel(exchangeSrc, itemType)

            let detail = ''
            const rate = rules.exchangeRates[itemType]
            if (rate) {
                const quantity: number =
                    (pointsCost / (rate.points || 1)) * (rate.ratio || 1)
                const formattedQty = Number.isInteger(quantity)
                    ? String(quantity)
                    : quantity.toFixed(1)
                detail = `${formattedQty}${rate.unit}`
            }

            const currentMonth: string = new Date().toISOString().slice(0, 7)

            let exchange!: Exchange
            await db.transaction(async (tx) => {
                const summary = await recomputeMonthSummary(currentMonth, tx)
                // 余额不足时抛错回滚事务，由 catch 统一返回，避免对已发送响应重复写入
                if (summary.availableBalance < pointsCost) {
                    throw Object.assign(new Error('积分不足'), {
                        balance: summary.availableBalance,
                    })
                }
                const exchangeRows = await tx
                    .insert(exchanges)
                    .values({ itemType, pointsCost, detail })
                    .returning()
                exchange = exchangeRows[0] as Exchange

                await tx.insert(pointRecords).values({
                    type: 'deduct',
                    amount: pointsCost,
                    reason: `兑换${itemLabel} ${detail}`,
                    ruleName: `exchangeRates.${itemType}`,
                    relatedId: exchange.id,
                    relatedType: 'exchange',
                })

                await recomputeMonthSummary(currentMonth, tx)
            })

            res.json(exchange as Exchange)
        } catch (err) {
            const balance = (err as { balance?: number }).balance
            if (balance !== undefined) {
                res.status(400).json({ error: '积分不足', balance })
                return
            }
            console.error('创建兑换失败:', err)
            res.status(500).json({ error: '创建兑换失败' })
        }
    },
)

router.post(
    '/:id/revoke',
    async (
        req: Request<{ id: string }>,
        res: Response<RevokeExchangeResponse | ApiErrorResponse>,
    ) => {
        const id = Number(req.params.id)
        if (!Number.isInteger(id) || id <= 0) {
            res.status(400).json({ error: '无效的兑换 ID' })
            return
        }

        const exchangeRows = (await db
            .select()
            .from(exchanges)
            .where(eq(exchanges.id, id))) as Exchange[]
        const exchange: Exchange | undefined = exchangeRows[0]
        if (!exchange) {
            res.status(404).json({ error: '兑换记录不存在' })
            return
        }
        if (exchange.status === 'revoked') {
            res.status(400).json({ error: '该兑换已撤销' })
            return
        }

        try {
            const currentMonth: string = new Date().toISOString().slice(0, 7)

            await db.transaction(async (tx) => {
                // 撤销仅将兑换扣减流水标记为已撤销，并改 exchanges 状态为 revoked。
                // 可用余额由 recomputeMonthSummary 统一重算：totalExchanges 因状态变更而减少，
                // 从而自动恢复余额，无需插入反向 earn（否则会重复加回导致余额虚高）。
                await tx
                    .update(pointRecords)
                    .set({ relatedType: 'revoked' })
                    .where(
                        and(
                            eq(pointRecords.relatedId, exchange.id),
                            eq(pointRecords.relatedType, 'exchange'),
                        ),
                    )

                await tx
                    .update(exchanges)
                    .set({ status: 'revoked' })
                    .where(eq(exchanges.id, id))

                await recomputeMonthSummary(currentMonth, tx)
            })

            res.json({ success: true })
        } catch (err) {
            console.error('撤销兑换失败:', err)
            res.status(500).json({ error: '撤销兑换失败，请重试' })
        }
    },
)

export { router as exchangesRouter }
