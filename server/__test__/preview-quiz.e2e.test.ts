import { beforeAll, describe, expect, it, vi } from 'vitest'
import { api, initRequest } from './helpers'
import { pushSchema } from './test-db'
import {
    analyzePreview,
    generatePreviewQuestions,
    gradePreviewAnswers,
} from '../src/services/ai'

// 伪 AI：生成固定 3 题、批改固定满分，覆盖完整链路且无网络、无 API Key
vi.mock('../src/services/ai', async () => {
    const { buildAiMock } = await import('./ai-mock')
    return buildAiMock()
})

const PREVIEW = {
    content: '预习内容示例',
    oldKnowledge: '已有旧知',
    questions: '我的疑问',
}

let lessonSeq = 0
async function createLesson(): Promise<number> {
    lessonSeq += 1
    const res = await api()
        .post('/api/lessons')
        .send({ subject: 'math', topic: `分数的加减法-${lessonSeq}` })
    expect(res.status).toBe(200)
    return res.body.id
}

// 保存预习并按需触发 AI 分析；score<80 时临时覆盖分析结果为低分以验证门槛拦截
async function saveAndAnalyze(lessonId: number, score = 85) {
    await api().post(`/api/lessons/${lessonId}/preview`).send(PREVIEW)
    if (score < 80) {
        analyzePreview.mockResolvedValueOnce(
            JSON.stringify({
                completenessScore: score,
                completenessComment: '不足',
                strengths: [],
                gaps: ['概念'],
                classFocusPoints: [],
                overallComment: '需加强',
            }),
        )
    }
    const res = await api()
        .post(`/api/lessons/${lessonId}/preview/analyze`)
        .send({})
    expect(res.status).toBe(200)
    return res
}

describe('课前预习课堂问答题：生成 → 作答 → 评分 → 心得解锁', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
    })

    it('预习完整度未达 80 分时拒绝生成课堂问答题', async () => {
        const lessonId = await createLesson()
        await saveAndAnalyze(lessonId, 50)

        const genRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz`)
            .send({})
        expect(genRes.status).toBe(403)
        expect(genRes.body.error).toContain('80')
    })

    it('完整度达标后可生成、幂等、作答评分并解锁心得', async () => {
        const lessonId = await createLesson()
        await saveAndAnalyze(lessonId, 85)

        const genRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz`)
            .send({})
        expect(genRes.status).toBe(200)
        expect(genRes.body.quiz.questions).toHaveLength(3)
        expect(generatePreviewQuestions).toHaveBeenCalledOnce()

        // 幂等：重复生成返回同一记录，不重复调用 AI
        const genAgain = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz`)
            .send({})
        expect(genAgain.status).toBe(200)
        expect(genAgain.body.quiz.id).toBe(genRes.body.quiz.id)
        expect(generatePreviewQuestions).toHaveBeenCalledOnce()

        // 列表聚合：已生成但未评分
        const listBefore = await api().get('/api/lessons')
        const itemBefore = listBefore.body.find(
            (l: { id: number }) => l.id === lessonId,
        )
        expect(itemBefore.previewQuizGenerated).toBe(true)
        expect(itemBefore.previewQuizScore).toBeNull()

        // 作答并提交批改（mock 返回满分 100）
        const submitRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz/submit`)
            .send({ answers: ['答1', '答2', '答3'] })
        expect(submitRes.status).toBe(200)
        expect(submitRes.body.quiz.score).toBe(100)
        expect(submitRes.body.quiz.results).toHaveLength(3)
        expect(gradePreviewAnswers).toHaveBeenCalledOnce()

        // 列表聚合：已出分（不卡分数高低），心得据此解锁
        const listAfter = await api().get('/api/lessons')
        const itemAfter = listAfter.body.find(
            (l: { id: number }) => l.id === lessonId,
        )
        expect(itemAfter.previewQuizScore).toBe(100)
    })

    it('保存预习内容变更会作废已生成的课堂问答题', async () => {
        const lessonId = await createLesson()
        await saveAndAnalyze(lessonId, 85)
        const genRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz`)
            .send({})
        expect(genRes.status).toBe(200)

        // 修改预习内容 → 作废问答
        const saveRes = await api()
            .post(`/api/lessons/${lessonId}/preview`)
            .send({ ...PREVIEW, content: '修改后的预习内容' })
        expect(saveRes.status).toBe(200)

        const getRes = await api().get(`/api/lessons/${lessonId}/preview/quiz`)
        expect(getRes.body.quiz).toBeNull()

        const listRes = await api().get('/api/lessons')
        const item = listRes.body.find(
            (l: { id: number }) => l.id === lessonId,
        )
        expect(item.previewQuizGenerated).toBe(false)
    })

    it('未填预习（无题目）的课程可直接写心得', async () => {
        const newId = await createLesson()

        const listRes = await api().get('/api/lessons')
        const item = listRes.body.find(
            (l: { id: number }) => l.id === newId,
        )
        expect(item.previewDone).toBe(false)
        expect(item.previewQuizGenerated).toBe(false)
    })

    it('未生成或已评分时提交会被拒绝', async () => {
        const lessonId = await createLesson()
        await saveAndAnalyze(lessonId, 85)
        const genRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz`)
            .send({})
        expect(genRes.status).toBe(200)

        const submitRes = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz/submit`)
            .send({ answers: ['a', 'b', 'c'] })
        expect(submitRes.status).toBe(200)

        // 已评分重复提交 → 409
        const dup = await api()
            .post(`/api/lessons/${lessonId}/preview/quiz/submit`)
            .send({ answers: ['a', 'b', 'c'] })
        expect(dup.status).toBe(409)

        // 未生成过问答的 lesson 提交 → 404
        const fresh = await api()
            .post('/api/lessons')
            .send({ subject: 'math', topic: '未生成问答的课题' })
        const freshId = fresh.body.id
        const noQuiz = await api()
            .post(`/api/lessons/${freshId}/preview/quiz/submit`)
            .send({ answers: ['a', 'b', 'c'] })
        expect(noQuiz.status).toBe(404)
    })
})
