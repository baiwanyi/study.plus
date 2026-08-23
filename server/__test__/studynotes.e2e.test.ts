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

describe('全链路：学习管理 → AI 评估 → 测验 → 批改', () => {
    let lessonId = -1

    beforeAll(async () => {
        await initRequest()
        await pushSchema()
        const lessonRes = await api()
            .post('/api/lessons')
            .send({ subject: 'math', topic: '分数的加减法' })
        expect(lessonRes.status).toBe(200)
        lessonId = lessonRes.body.id
    })

    it('创建心得后可评估（满分门槛通过）并生成测验、提交批改', async () => {
        // 1. 创建学习管理
        const createRes = await api()
            .post('/api/study')
            .send(makeStudyNote({ lessonId }))
        expect(createRes.status).toBe(200)
        const cardId = createRes.body.id
        expect(cardId).toBeDefined()

        // 2. AI 评估（mock 返回 completenessScore=90，满足 80 门槛）
        const evalRes = await api().post(`/api/study/${cardId}/evaluate`)
        expect(evalRes.status).toBe(200)
        expect(evalRes.body.evaluation.completenessScore).toBe(90)
        expect(evaluateStudynotesReflection).toHaveBeenCalledOnce()

        // 3. 生成测验（mock 返回 20 题）
        const quizRes = await api().post(`/api/study/${cardId}/quiz`)
        expect(quizRes.status).toBe(200)
        expect(quizRes.body.quiz.questions).toHaveLength(20)
        const quizId = quizRes.body.quiz.id
        expect(quizId).toBeDefined()

        // 4. 提交答案（仅保存并标记已提交，不批改，故 score 此时为空）
        const submitRes = await api()
            .post(`/api/study/${cardId}/quiz/${quizId}/submit`)
            .send({
                answers: Array.from({ length: 20 }, (_, i) => `答案${i + 1}`),
            })
        expect(submitRes.status).toBe(200)
        expect(submitRes.body.quiz.submittedAt).toBeDefined()

        // 5. 批改（mock 返回全部正确，score=100），分数只写入 study_quiz.score
        const gradeRes = await api()
            .post(`/api/study/${cardId}/quiz/${quizId}/grade`)
            .send({})
        expect(gradeRes.status).toBe(200)
        expect(gradeRes.body.quiz.score).toBe(100)
        expect(gradeRes.body.quiz.correctCount).toBe(20)
        expect(gradeStudynotesQuiz).toHaveBeenCalledOnce()

        // 6. 再次查询心得，quizScore 应统一取自 study_quiz.score（不再回写 study_notes）
        const detailRes = await api().get(`/api/study/${cardId}`)
        expect(detailRes.status).toBe(200)
        expect(detailRes.body.quizScore).toBe(100)
    })

    // 评估分数低于门槛（mock 返回 50）时，生成测验应被拒绝
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

        const createRes = await api()
            .post('/api/study')
            .send(makeStudyNote({ lessonId }))
        const cardId = createRes.body.id

        const evalRes = await api().post(`/api/study/${cardId}/evaluate`)
        expect(evalRes.status).toBe(200)
        expect(evalRes.body.evaluation.completenessScore).toBe(50)

        const quizRes = await api().post(`/api/study/${cardId}/quiz`)
        expect(quizRes.status).toBe(403)
    })
})
