import { beforeAll, describe, expect, it, vi } from 'vitest'
import { api, initRequest } from './helpers'
import { pushSchema, seedHomeworkRule, db } from './test-db'
import { buildAiMock } from './ai-mock'
import { pointRecords } from '../src/db/schema'
import { sql } from 'drizzle-orm'

// 积分链路部分端点（兑换）会调用 AI 无关的 loadRules，但 summary-helper 与
// exchanges 内部不依赖 AI；不过 points 路由本身不直接调 AI。为稳健起见仍 mock
// services/ai，避免任何隐式依赖导致真实网络调用。
// 使用动态 import 规避 vi.mock 工厂的 hoisting 时序限制。
vi.mock('../src/services/ai', async () => {
    const { buildAiMock } = await import('./ai-mock')
    return buildAiMock()
})

// 预支还款受「每月 1 号」守卫限制，测试中固定放行以便验证还款流程。
vi.mock('../src/routes/advance-helper', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../routes/advance-helper')>()
    return {
        ...actual,
        isFirstDayOfMonth: vi.fn(() => true),
    }
})

describe('全链路：积分管理 → 兑换 → 预支还款', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
        await seedHomeworkRule({ A: 20 })
    })

    it('手动加分后可兑换并撤销，余额正确回滚', async () => {
        // 1. 手动加分 100
        const earnRes = await api()
            .post('/api/points')
            .send({ type: 'earn', amount: 100, reason: '测试加分' })
        expect(earnRes.status).toBe(200)

        // 2. 余额应反映 100
        const summaryRes = await api().get('/api/points/summary')
        expect(summaryRes.status).toBe(200)
        expect(summaryRes.body.availableBalance).toBe(100)

        // 3. 兑换 50（余额充足）
        const exchangeRes = await api()
            .post('/api/exchanges')
            .send({ itemType: 'games', pointsCost: 50 })
        expect(exchangeRes.status).toBe(200)
        const exchangeId = exchangeRes.body.id

        // 兑换后余额 100-50=50
        const summaryAfter = await api().get('/api/points/summary')
        expect(summaryAfter.body.availableBalance).toBe(50)

        // 4. 撤销兑换，余额回滚至 100
        const revokeRes = await api().post(
            `/api/exchanges/${exchangeId}/revoke`,
        )
        expect(revokeRes.status).toBe(200)
        const summaryFinal = await api().get('/api/points/summary')
        expect(summaryFinal.body.availableBalance).toBe(100)
    })

    it('余额不足时兑换被拒绝', async () => {
        const exchangeRes = await api()
            .post('/api/exchanges')
            .send({ itemType: 'games', pointsCost: 999999 })
        expect(exchangeRes.status).toBe(400)
        expect(exchangeRes.body.error).toBe('积分不足')
    })

    it('按等级加分（homework.A=20）联动积分', async () => {
        const res = await api()
            .post('/api/points/by-grade')
            .send({ category: 'submission', grade: 'A' })
        expect(res.status).toBe(200)
        expect(res.body.amount).toBe(20)
        expect(res.body.ruleName).toBe('作业批改-A')
    })

    it('预支创建与每月首日还款', async () => {
        const advanceRes = await api()
            .post('/api/points/advances')
            .send({ amount: 100, installments: 1 })
        expect(advanceRes.status).toBe(201)
        expect(advanceRes.body.amount).toBe(100)

        const repayRes = await api().post('/api/points/advances/repay')
        expect(repayRes.status).toBe(200)
        expect(repayRes.body.repaid).toBeGreaterThan(0)

        // 还款应产生一条还款流水记录（真实实现以 relatedType='advance' 标记）
        const rows = await db
            .select()
            .from(pointRecords)
            .where(sql`${pointRecords.relatedType} = 'advance'`)
        expect(rows.length).toBeGreaterThan(0)
    })
})
