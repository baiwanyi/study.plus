// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createMockDb } = await import('./_helpers')
    return createMockDb('study-exch-test-')
})

import exchangesRouter from '@apps/routes/exchanges'
import { getClient } from './_helpers'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/exchanges', exchangesRouter)
})

afterAll(async () => {
    const client = getClient()
    if (client) await client.close()
})

beforeEach(async () => {
    const client = getClient()
    if (client) {
        await client.execute('DELETE FROM exchanges')
        await client.execute('DELETE FROM point_records')
        await client.execute('DELETE FROM month_summary')
    }
    // Ensure month_summary has sufficient balance for exchanges
    // availableBalance = basePoints - monthlyBasePoints (default 500) - exchanges + advanceEarn
    // So basePoints must be > monthlyBasePoints for any exchange to work
    await client!.execute('DELETE FROM month_summary')
    const month = new Date().toISOString().slice(0, 7)
    await client!.execute({
        sql: 'INSERT INTO month_summary (month, base_points, balance) VALUES (?, 600, 600)',
        args: [month],
    })
})

describe('GET /api/exchanges', () => {
    it('空列表应返回空数组', async () => {
        const res = await request(app).get('/api/exchanges').expect(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(0)
    })
})

describe('POST /api/exchanges', () => {
    it('应创建兑换记录', async () => {
        const res = await request(app)
            .post('/api/exchanges')
            .send({ itemType: 'game', pointsCost: 10 })
            .expect(200)

        expect(res.body.itemType).toBe('game')
        expect(res.body.pointsCost).toBe(10)
        expect(res.body.status).toBe('active')
    })

    it('缺 itemType 应返回 400', async () => {
        await request(app)
            .post('/api/exchanges')
            .send({ pointsCost: 10 })
            .expect(400)
    })

    it('缺 pointsCost 应返回 400', async () => {
        await request(app)
            .post('/api/exchanges')
            .send({ itemType: 'game' })
            .expect(400)
    })
})

describe('POST /api/exchanges/:id/revoke', () => {
    let exchangeId: number
    beforeEach(async () => {
        const res = await request(app)
            .post('/api/exchanges')
            .send({ itemType: 'game', pointsCost: 10 })
        exchangeId = res.body.id
    })

    it('应撤销兑换', async () => {
        const res = await request(app)
            .post(`/api/exchanges/${exchangeId}/revoke`)
            .expect(200)

        expect(res.body.success).toBe(true)
    })

    it('重复撤销应返回 400', async () => {
        await request(app)
            .post(`/api/exchanges/${exchangeId}/revoke`)

        await request(app)
            .post(`/api/exchanges/${exchangeId}/revoke`)
            .expect(400)
    })

    it('不存在的兑换应返回 404', async () => {
        await request(app)
            .post('/api/exchanges/99999/revoke')
            .expect(404)
    })
})
