// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createClient } = await import('@libsql/client')
    const { drizzle } = await import('drizzle-orm/libsql')
    const schema = await import('@apps/db/schema')
    const path = await import('path')
    const fs = await import('fs')
    const os = await import('os')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-pts-test-'))
    const dbPath = path.join(tmpDir, 'test.db')
    const client = createClient({ url: `file:${dbPath}` })

    // Create tables
    await client.execute(`CREATE TABLE IF NOT EXISTS options (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL)`)
    await client.execute(`CREATE TABLE IF NOT EXISTS point_records (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, rule_name TEXT, related_id INTEGER, related_type TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS month_summary (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL UNIQUE, base_points INTEGER NOT NULL DEFAULT 500, total_earn INTEGER NOT NULL DEFAULT 0, total_deduct INTEGER NOT NULL DEFAULT 0, total_exchanges INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 500)`)
    await client.execute(`CREATE TABLE IF NOT EXISTS exchanges (id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL, points_cost INTEGER NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS point_advances (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER NOT NULL, total_repayment INTEGER NOT NULL, installments INTEGER NOT NULL, installment_amount INTEGER NOT NULL, paid_installments INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)

    // Insert default options
    const defaultRules = [
        { key: 'homework', value: JSON.stringify([{ grade: 'A+', points: 50 }, { grade: 'A', points: 20 }, { grade: 'B', points: 10 }, { grade: 'C', points: -10 }, { grade: 'D', points: -20 }, { grade: 'E', points: -50 }]) },
        { key: 'exam', value: JSON.stringify([{ min: 0, max: 59, points: -50 }, { min: 60, max: 69, points: -20 }, { min: 70, max: 79, points: -10 }, { min: 80, max: 89, points: 10 }, { min: 90, max: 94, points: 20 }, { min: 95, max: 100, points: 50 }]) },
        { key: 'custom', value: JSON.stringify([]) },
        { key: 'system', value: JSON.stringify({ monthlyBasePoints: 500, minimumPointsForPrivileges: 100 }) },
    ]
    for (const rule of defaultRules) {
        await client.execute({ sql: 'INSERT OR IGNORE INTO options (key, value) VALUES (?, ?)', args: [rule.key, rule.value] })
    }

    const db = drizzle(client, { schema })
    return { db, client }
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
    await client.execute('DELETE FROM point_records')
    await client.execute('DELETE FROM month_summary')
})

describe('POST /api/points/by-grade', () => {
    it('A 等级应加 20 分', async () => {
        const res = await request(app)
            .post('/api/points/by-grade')
            .send({ category: 'homework', grade: 'A' })
            .expect(200)

        expect(res.body.type).toBe('earn')
        expect(res.body.amount).toBe(20)
    })

    it('C 等级应扣 10 分', async () => {
        const res = await request(app)
            .post('/api/points/by-grade')
            .send({ category: 'homework', grade: 'C' })
            .expect(200)

        expect(res.body.type).toBe('deduct')
        expect(res.body.amount).toBe(10)
    })

    it('E 等级应扣 50 分', async () => {
        const res = await request(app)
            .post('/api/points/by-grade')
            .send({ category: 'homework', grade: 'E' })
            .expect(200)

        expect(res.body.type).toBe('deduct')
        expect(res.body.amount).toBe(50)
    })
})

describe('GET /api/points', () => {
    it('应返回积分记录列表', async () => {
        await request(app)
            .post('/api/points/by-grade')
            .send({ category: 'homework', grade: 'A' })

        const res = await request(app).get('/api/points').expect(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBeGreaterThanOrEqual(1)
    })
})

describe('POST /api/points/by-exam-score', () => {
    it('95 分应加 50 分', async () => {
        const res = await request(app)
            .post('/api/points/by-exam-score')
            .send({ score: 95 })
            .expect(200)

        expect(res.body.type).toBe('earn')
        expect(res.body.amount).toBe(50)
    })

    it('50 分应扣 50 分', async () => {
        const res = await request(app)
            .post('/api/points/by-exam-score')
            .send({ score: 50 })
            .expect(200)

        expect(res.body.type).toBe('deduct')
        expect(res.body.amount).toBe(50)
    })
})

describe('POST /api/points/by-custom-rule', () => {
    it('不存在的规则应返回 404', async () => {
        const res = await request(app)
            .post('/api/points/by-custom-rule')
            .send({ ruleId: 'nonexistent' })
            .expect(404)

        expect(res.body.error).toContain('自定义规则不存在')
    })
})
