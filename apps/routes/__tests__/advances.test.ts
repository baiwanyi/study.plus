// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async (importOriginal) => {
    const path = await import('path')
    const fs = await import('fs')
    const os = await import('os')
    const { createTables } = await import('../../test/db')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-adv-test-'))
    const dbPath = path.join(tmpDir, 'test.db')
    process.env.DB_PATH = dbPath

    const realMod = await importOriginal()
    const { client } = realMod as { client: import('@libsql/client').Client }
    await createTables(client)
    return realMod
})

vi.mock('@apps/routes/advance-helper', async (importOriginal) => {
    const actual = await importOriginal() as object
    return {
        ...actual,
        isFirstDayOfMonth: () => true,
    }
})

import pointsRouter from '@apps/routes/points'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/points', pointsRouter)
})

afterAll(async () => {
    const { client } = await import('@apps/db/index')
    client.close()
})

beforeEach(async () => {
    const { client } = await import('@apps/db/index')
    await client.execute('DELETE FROM point_advances')
    await client.execute('DELETE FROM point_records')
    await client.execute('DELETE FROM month_summary')
})

describe('POST /api/points/advances', () => {
    it('应创建预支记录并返回 201', async () => {
        const res = await request(app)
            .post('/api/points/advances')
            .send({ amount: 100, installments: 3 })
            .expect(201)

        expect(res.body.amount).toBe(100)
        expect(res.body.installments).toBe(3)
        expect(res.body.totalRepayment).toBe(118)
        expect(res.body.installmentAmount).toBe(40)
        expect(res.body.paidInstallments).toBe(0)
        expect(res.body.status).toBe('active')
    })

    it('金额不足应返回 400', async () => {
        await request(app)
            .post('/api/points/advances')
            .send({ amount: -1, installments: 3 })
            .expect(400)
    })

    it('分期数无效应返回 400', async () => {
        await request(app)
            .post('/api/points/advances')
            .send({ amount: 100, installments: 0 })
            .expect(400)
    })
})

describe('GET /api/points/advances', () => {
    beforeEach(async () => {
        await request(app)
            .post('/api/points/advances')
            .send({ amount: 100, installments: 3 })
    })

    it('应返回预支记录列表', async () => {
        const res = await request(app)
            .get('/api/points/advances')
            .expect(200)

        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBeGreaterThanOrEqual(1)
    })

    it('应返回预支汇总', async () => {
        const res = await request(app)
            .get('/api/points/advances/summary')
            .expect(200)

        expect(res.body).toHaveProperty('totalPendingRepayment')
        expect(res.body).toHaveProperty('currentInstallmentDue')
        expect(res.body).toHaveProperty('remainingCredit')
    })
})

describe('POST /api/points/advances/repay', () => {
    beforeEach(async () => {
        const { client } = await import('@apps/db/index')
        await client.execute({
            sql: `INSERT INTO point_advances (amount, total_repayment, installments, installment_amount, paid_installments, status)
                  VALUES (100, 118, 3, 40, 0, 'active')`,
            args: [],
        })
    })

    it('应完成完整的还款流程 (3期还款至 completed)', async () => {
        let res = await request(app)
            .post('/api/points/advances/repay')
            .expect(200)
        expect(res.body.repaid).toBe(40)

        res = await request(app)
            .post('/api/points/advances/repay')
            .expect(200)
        expect(res.body.repaid).toBe(40)

        res = await request(app)
            .post('/api/points/advances/repay')
            .expect(200)
        expect(res.body.repaid).toBe(40)
    })

    it('最后一期完成后 status 应为 completed', async () => {
        await request(app).post('/api/points/advances/repay')
        await request(app).post('/api/points/advances/repay')
        await request(app).post('/api/points/advances/repay')

        const { client } = await import('@apps/db/index')
        const rows = await client.execute({
            sql: 'SELECT paid_installments, status FROM point_advances',
            args: [],
        })
        expect(rows.rows.length).toBe(1)
        const advance = rows.rows[0] as any
        expect(advance.paid_installments).toBe(3)
        expect(advance.status).toBe('completed')
    })

    it('无活跃预支时 repaid 应为 0', async () => {
        await request(app).post('/api/points/advances/repay')
        await request(app).post('/api/points/advances/repay')
        await request(app).post('/api/points/advances/repay')

        const res = await request(app)
            .post('/api/points/advances/repay')
            .expect(200)
        expect(res.body.repaid).toBe(0)
    })
})
