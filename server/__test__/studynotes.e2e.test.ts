import { beforeAll, describe, expect, it, vi } from 'vitest'
import { api, initRequest, makeStudyNote } from './helpers'
import { pushSchema } from './test-db'
import {
    evaluateStudynotesReflection,
    gradeStudynotesQuiz,
} from '../src/services/ai'

// 用可预测的伪 AI 实现替换全部外部 AI 调用（无网络、无 API Key）。
// 使用动态 import 规避 vi.mock 工厂的 hoisting 时序限制。
vi.mock('../src/services/ai', async () => {
    const { buildAiMock } = await import('./ai-mock')
    return buildAiMock()
})

describe('全链路：学习心得 → AI 评估 → 测验 → 批改', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
    })

    it('创建心得后可评估（满分门槛通过）并生成测验、提交批改', async () => {
        // 1. 创建学习心得
        const createRes = await api().post('/api/studynotes').send(makeStudyNote())
        expect(createRes.status).toBe(200)
        const cardId = createRes.body.id
        expect(cardId).toBeDefined()

        // 2. AI 评估（mock 返回 completenessScore=90，满足 80 门槛）
        const evalRes = await api().post(`/api/studynotes/${cardId}/evaluate`)
        expect(evalRes.status).toBe(200)
        expect(evalRes.body.evaluation.completenessScore).toBe(90)
        expect(evaluateStudynotesReflection).toHaveBeenCalledOnce()

        // 3. 生成测验（mock 返回 10 题）
        const quizRes = await api().post(`/api/studynotes/${cardId}/quiz`)
        expect(quizRes.status).toBe(200)
        expect(quizRes.body.quiz.questions).toHaveLength(10)
        const quizId = quizRes.body.quiz.id
        expect(quizId).toBeDefined()

        // 4. 提交批改（mock 返回全部正确，score=100）
        const submitRes = await api()
            .post(`/api/studynotes/${cardId}/quiz/${quizId}/submit`)
            .send({
                answers: Array.from({ length: 10 }, (_, i) => `答案${i + 1}`),
            })
        expect(submitRes.status).toBe(200)
        expect(submitRes.body.quiz.score).toBe(100)
        expect(submitRes.body.quiz.correctCount).toBe(10)
        expect(gradeStudynotesQuiz).toHaveBeenCalledOnce()

        // 5. 再次查询心得，quizScore 应被回写
        const detailRes = await api().get(`/api/studynotes/${cardId}`)
        expect(detailRes.status).toBe(200)
        expect(detailRes.body.quizScore).toBe(100)
    })

    it('评估分数低于门槛时不允许生成测验', async () => {
        // 临时让评估返回低分
        evaluateStudynotesReflection.mockResolvedValueOnce(
            JSON.stringify({
                completenessScore: 50,
                completenessComment: '内容不完整',
                missingPoints: ['缺少例证'],
                errors: [],
                improvementSuggestions: ['补充细节'],
                overallComment: '需完善',
            }),
        )

        const createRes = await api().post('/api/studynotes').send(makeStudyNote())
        const cardId = createRes.body.id

        const evalRes = await api().post(`/api/studynotes/${cardId}/evaluate`)
        expect(evalRes.status).toBe(200)
        expect(evalRes.body.evaluation.completenessScore).toBe(50)

        const quizRes = await api().post(`/api/studynotes/${cardId}/quiz`)
        expect(quizRes.status).toBe(403)
    })
})
