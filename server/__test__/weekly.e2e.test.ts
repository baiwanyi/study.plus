import { beforeAll, describe, expect, it, vi } from 'vitest'
import { api, initRequest } from './helpers'
import { pushSchema } from './test-db'
import {
    analyzeWeeklyReport,
    chatAboutWeeklyReport,
} from '../src/services/ai'

// 用可预测的伪 AI 实现替换全部外部 AI 调用（无网络、无 API Key）。
// 使用动态 import 规避 vi.mock 工厂的 hoisting 时序限制。
vi.mock('../src/services/ai', async () => {
    const { buildAiMock } = await import('./ai-mock')
    return buildAiMock()
})

const weeklyContent = {
    learned: '本周学了分数运算',
    difficulties: '通分容易错',
    weakPoints: '异分母加法',
    achievement: '完成全部作业',
    lastWeekGoalReview: '达成',
    smartGoalS: '每天练习 10 道分数题',
    smartGoalM: '正确率 > 90%',
    smartGoalA: '可执行',
    smartGoalR: '针对薄弱点',
    smartGoalT: '本周内',
    improvement: '减少粗心',
}

describe('全链路：周报 → AI 分析 → 对话', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
    })

    it('创建周报后可 AI 分析，并支持多轮对话', async () => {
        // 1. 创建周报
        const createRes = await api()
            .post('/api/weekly')
            .send({ weekNumber: 32, year: 2026, content: weeklyContent })
        expect(createRes.status).toBe(201)
        const reportId = createRes.body.id
        expect(reportId).toBeDefined()

        // 2. AI 分析（mock 返回 WeeklyAnalysis）
        const analyzeRes = await api().post(`/api/weekly/${reportId}/analyze`)
        expect(analyzeRes.status).toBe(200)
        expect(analyzeRes.body.analysis).toBeDefined()
        expect(analyzeRes.body.analysis.summary).toBe('总体表现良好')
        expect(analyzeWeeklyReport).toHaveBeenCalledOnce()

        // 分析后会创建会话并无首条 assistant 消息（来自 summary）
        const convRes = await api().get(`/api/weekly/${reportId}/conversation`)
        expect(convRes.status).toBe(200)
        expect(convRes.body.messages.length).toBeGreaterThan(0)

        // 3. 多轮对话
        const chatRes1 = await api()
            .post(`/api/weekly/${reportId}/chat`)
            .send({ message: '如何提高正确率？' })
        expect(chatRes1.status).toBe(200)
        expect(chatRes1.body.reply).toBe('AI 周报对话回复')
        expect(chatAboutWeeklyReport).toHaveBeenCalledOnce()

        const chatRes2 = await api()
            .post(`/api/weekly/${reportId}/chat`)
            .send({ message: '下周目标怎么定？' })
        expect(chatRes2.status).toBe(200)
        expect(chatRes2.body.reply).toBe('AI 周报对话回复')

        // 会话消息应随对话累积
        const convAfter = await api().get(`/api/weekly/${reportId}/conversation`)
        expect(convAfter.body.messages.length).toBeGreaterThanOrEqual(3)
    })

    it('分析不存在的周报返回 404', async () => {
        const res = await api().post('/api/weekly/999999/analyze')
        expect(res.status).toBe(404)
    })
})
