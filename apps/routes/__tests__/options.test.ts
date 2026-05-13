// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createMockDb } = await import('./_helpers')
    return createMockDb('study-opt-test-')
})

import optionsRouter from '@apps/routes/options'
import { getClient } from './_helpers'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/options', optionsRouter)
})

afterAll(async () => {
    const client = getClient()
    if (client) await client.close()
})

describe('GET /api/options', () => {
    it('应返回所有配置项（JSON 解析后）', async () => {
        const res = await request(app).get('/api/options').expect(200)

        expect(typeof res.body).toBe('object')
        expect(res.body).toHaveProperty('homework')
        expect(res.body).toHaveProperty('exam')
        expect(res.body).toHaveProperty('exchange')
        expect(res.body).toHaveProperty('system')
    })
})

describe('GET /api/options/:key', () => {
    it('应返回指定配置项', async () => {
        const res = await request(app)
            .get('/api/options/homework')
            .expect(200)

        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body[0]).toHaveProperty('grade')
        expect(res.body[0]).toHaveProperty('points')
    })

    it('不存在的 key 应返回 404', async () => {
        await request(app)
            .get('/api/options/nonexistent')
            .expect(404)
    })
})

describe('PUT /api/options/:key', () => {
    it('应创建新配置项', async () => {
        const res = await request(app)
            .put('/api/options/test-key')
            .send({ custom: 'value' })
            .expect(200)

        expect(res.body.success).toBe(true)
    })

    it('应更新已有配置项', async () => {
        await request(app)
            .put('/api/options/homework')
            .send([{ grade: 'A+', points: 100 }])

        const res = await request(app)
            .get('/api/options/homework')
            .expect(200)

        expect(res.body[0].points).toBe(100)
    })
})
