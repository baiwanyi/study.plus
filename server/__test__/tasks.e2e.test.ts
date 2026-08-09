import { beforeAll, describe, expect, it, vi } from 'vitest'
import { api, initRequest } from './helpers'
import { pushSchema, seedHomeworkRule } from './test-db'
import {
    generateTaskTitle,
    scoreComposition,
} from '../src/services/ai'

// 用可预测的伪 AI 实现替换全部外部 AI 调用（无网络、无 API Key）。
// 使用动态 import 规避 vi.mock 工厂的 hoisting 时序限制。
vi.mock('../src/services/ai', async () => {
    const { buildAiMock } = await import('./ai-mock')
    return buildAiMock()
})

describe('全链路：任务 → 积分联动 → 兑换', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
        await seedHomeworkRule({ A: 20 })
    })

    it('创建任务后可通过 AI 评分、联动积分，并可在积分商城兑换与撤销', async () => {
        // 1. 生成 AI 标题
        const titleRes = await api()
            .post('/api/tasks/ai-generate-title')
            .send({ type: 'homework', grade: 1 })
        expect(titleRes.status).toBe(200)
        expect(generateTaskTitle).toHaveBeenCalledOnce()

        // 2. 创建任务
        const createRes = await api()
            .post('/api/tasks')
            .send({
                type: 'composition',
                title: '分数加减法练习',
                content: '完成练习册第 1-3 页',
            })
        expect(createRes.status).toBe(200)
        const taskId = createRes.body.id
        expect(taskId).toBeDefined()

        // 3. 提交任务（状态流转）
        const submitRes = await api()
            .post(`/api/tasks/${taskId}/submit`)
            .send({ content: '这是学生的作业内容：完成分数加减法 10 题。' })
        expect(submitRes.status).toBe(200)

        // 4. AI 评分，联动积分（mock 返回 grade=A → 规则 homework.A=20）
        const scoreRes = await api().post(`/api/tasks/${taskId}/ai-score`)
        expect(scoreRes.status).toBe(200)
        expect(scoreRes.body.aiResult.grade).toBe('A')
        expect(scoreRes.body.aiResult.score).toBe(95)
        expect(scoreComposition).toHaveBeenCalledOnce()

        // 5. 查询积分，应看到本次评分产生的 earn 记录（+20）
        const pointsRes = await api().get('/api/points')
        expect(pointsRes.status).toBe(200)
        const records: Array<{
            type: string
            amount: number
            relatedType?: string
        }> = pointsRes.body
        const taskEarn = records.find(
            (e) => e.relatedType === 'task' || e.amount === 20,
        )
        expect(taskEarn).toBeDefined()
        expect(taskEarn.amount).toBe(20)

        // 兑换前可用余额（兑换扣减由 exchanges 表单独计入，
        // GET /api/points 故意排除 relatedType='exchange' 的记录，故用 summary 验证）
        const summaryBefore = await api().get('/api/points/summary')
        expect(summaryBefore.status).toBe(200)
        const balanceBefore = summaryBefore.body.availableBalance as number

        // 6. 积分商城兑换（消耗积分）
        const exchangeRes = await api()
            .post('/api/exchanges')
            .send({ itemType: 'games', pointsCost: 10 })
        expect(exchangeRes.status).toBe(200)
        const exchangeId = exchangeRes.body.id
        expect(exchangeId).toBeDefined()

        const summaryAfter = await api().get('/api/points/summary')
        expect(summaryAfter.status).toBe(200)
        const balanceAfter = summaryAfter.body.availableBalance as number
        expect(balanceBefore - balanceAfter).toBe(10)

        // 7. 撤销兑换，积分回滚
        const revokeRes = await api().post(`/api/exchanges/${exchangeId}/revoke`)
        expect(revokeRes.status).toBe(200)

        const summaryFinal = await api().get('/api/points/summary')
        expect(summaryFinal.status).toBe(200)
        expect(summaryFinal.body.availableBalance).toBe(balanceBefore)
    })

    it('缺 API Key 时拒绝访问（认证守卫）', async () => {
        const res = await api().post('/api/tasks').set('X-API-Key', '')
        expect(res.status).toBe(401)
    })
})
