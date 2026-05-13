// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createMockDb } = await import('./_helpers')
    return createMockDb('study-tasks-test-')
})

vi.mock('@apps/services/ai', () => ({
    scoreComposition: async () => ({
        grade: 'A',
        score: 95,
        comment: '优秀',
        suggestions: ['继续保持'],
    }),
    generateTitle: async () => 'AI生成的标题',
    generateTaskTitle: async () => 'AI出题标题',
}))

import tasksRouter from '@apps/routes/tasks'
import { getClient } from './_helpers'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/tasks', tasksRouter)
})

afterAll(async () => {
    const client = getClient()
    if (client) await client.close()
})

beforeEach(async () => {
    const client = getClient()
    if (client) {
        await client.execute('DELETE FROM submissions')
        await client.execute('DELETE FROM point_records')
        await client.execute('DELETE FROM tasks')
        await client.execute('DELETE FROM month_summary')
    }
})

describe('POST /api/tasks', () => {
    it('应创建任务', async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({ title: '作文练习', type: 'composition' })
            .expect(200)

        expect(res.body.title).toBe('作文练习')
        expect(res.body.type).toBe('composition')
        expect(res.body.status).toBe('pending')
        expect(res.body.id).toBeGreaterThan(0)
    })

    it('缺 title 应返回 400', async () => {
        await request(app)
            .post('/api/tasks')
            .send({ type: 'composition' })
            .expect(400)
    })

    it('无效 type 应返回 400', async () => {
        await request(app)
            .post('/api/tasks')
            .send({ title: '测试', type: 'invalid' })
            .expect(400)
    })
})

describe('GET /api/tasks', () => {
    beforeEach(async () => {
        await request(app)
            .post('/api/tasks')
            .send({ title: '任务A', type: 'composition' })
        await request(app)
            .post('/api/tasks')
            .send({ title: '任务B', type: 'mindmap' })
    })

    it('应返回所有任务', async () => {
        const res = await request(app).get('/api/tasks').expect(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBeGreaterThanOrEqual(2)
    })

    it('应支持 type 过滤', async () => {
        const res = await request(app)
            .get('/api/tasks?type=composition')
            .expect(200)
        for (const t of res.body) {
            expect(t.type).toBe('composition')
        }
    })
})

describe('PUT /api/tasks/:id', () => {
    let taskId: number
    beforeEach(async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({ title: '旧标题', type: 'composition' })
        taskId = res.body.id
    })

    it('应更新任务标题', async () => {
        const res = await request(app)
            .put(`/api/tasks/${taskId}`)
            .send({ title: '新标题' })
            .expect(200)

        expect(res.body.title).toBe('新标题')
    })

    it('应更新任务状态为 completed', async () => {
        const res = await request(app)
            .put(`/api/tasks/${taskId}`)
            .send({ status: 'completed' })
            .expect(200)

        expect(res.body.status).toBe('completed')
    })

    it('不存在的任务应返回 404', async () => {
        await request(app)
            .put('/api/tasks/99999')
            .send({ title: '测试' })
            .expect(404)
    })
})

describe('DELETE /api/tasks/:id', () => {
    it('应删除任务', async () => {
        const create = await request(app)
            .post('/api/tasks')
            .send({ title: '待删除', type: 'composition' })

        const res = await request(app)
            .delete(`/api/tasks/${create.body.id}`)
            .expect(200)

        expect(res.body.success).toBe(true)
    })
})

describe('POST /api/tasks/:id/submit', () => {
    let taskId: number
    beforeEach(async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({ title: '提交测试', type: 'composition' })
        taskId = res.body.id
    })

    it('应提交作业内容', async () => {
        const res = await request(app)
            .post(`/api/tasks/${taskId}/submit`)
            .send({ content: '这是我的作业内容' })
            .expect(200)

        expect(res.body.submission).toBeDefined()
        expect(res.body.submission.content).toBe('这是我的作业内容')
    })

    it('空缺 content 应返回 400', async () => {
        await request(app)
            .post(`/api/tasks/${taskId}/submit`)
            .send({})
            .expect(400)
    })
})

describe('POST /api/tasks/:id/ai-score', () => {
    let taskId: number
    beforeEach(async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({ title: 'AI评分测试', type: 'composition' })
        taskId = res.body.id
        await request(app)
            .post(`/api/tasks/${taskId}/submit`)
            .send({ content: '这是一篇作文内容' })
    })

    it('应返回 AI 评分结果', async () => {
        const res = await request(app)
            .post(`/api/tasks/${taskId}/ai-score`)
            .expect(200)

        expect(res.body.aiResult).toBeDefined()
        expect(res.body.aiResult.grade).toBe('A')
        expect(res.body.pointsEarned).toBeGreaterThan(0)
    })
})

describe('POST /api/tasks/:id/ai-title', () => {
    let taskId: number
    beforeEach(async () => {
        const res = await request(app)
            .post('/api/tasks')
            .send({ title: 'AI标题测试', type: 'composition' })
        taskId = res.body.id
        await request(app)
            .post(`/api/tasks/${taskId}/submit`)
            .send({ content: '需要生成标题的作业内容' })
    })

    it('应生成 AI 标题', async () => {
        const res = await request(app)
            .post(`/api/tasks/${taskId}/ai-title`)
            .expect(200)

        expect(res.body.title).toBe('AI生成的标题')
    })
})

describe('POST /api/tasks/ai-generate-title', () => {
    it('应生成出题标题', async () => {
        const res = await request(app)
            .post('/api/tasks/ai-generate-title')
            .send({ type: 'composition', grade: 3 })
            .expect(200)

        expect(res.body.title).toBeTruthy()
    })
})
