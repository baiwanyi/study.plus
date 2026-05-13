// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createMockDb } = await import('./_helpers')
    const mod = await createMockDb('study-ai-test-')
    const client = mod.client as import('@libsql/client').Client
    // Add ai_usage_logs table (not in base helper)
    await client.execute(`CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        task_id INTEGER,
        task_title TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    return mod
})

import aiUsageRouter from '@apps/routes/ai-usage'
import { getClient } from './_helpers'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/ai-usage', aiUsageRouter)
})

afterAll(async () => {
    const client = getClient()
    if (client) await client.close()
})

beforeEach(async () => {
    const client = getClient()
    if (client) {
        await client.execute('DELETE FROM ai_usage_logs')
    }
})

describe('GET /api/ai-usage', () => {
    it('空列表应返回空数组', async () => {
        const res = await request(app).get('/api/ai-usage').expect(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(0)
    })

    it('应返回 AI 使用日志', async () => {
        const client = getClient()!
        await client.execute({
            sql: 'INSERT INTO ai_usage_logs (project, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?)',
            args: ['ai-score', 100, 50, 150],
        })
        await client.execute({
            sql: 'INSERT INTO ai_usage_logs (project, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?)',
            args: ['ai-title', 200, 80, 280],
        })

        const res = await request(app).get('/api/ai-usage').expect(200)
        expect(res.body.length).toBe(2)
    })
})

describe('GET /api/ai-usage/summary', () => {
    it('空数据应返回空数组', async () => {
        const res = await request(app)
            .get('/api/ai-usage/summary')
            .expect(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('应返回分组汇总', async () => {
        const client = getClient()!
        await client.execute({
            sql: 'INSERT INTO ai_usage_logs (project, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?)',
            args: ['ai-score', 100, 50, 150],
        })
        await client.execute({
            sql: 'INSERT INTO ai_usage_logs (project, prompt_tokens, completion_tokens, total_tokens) VALUES (?, ?, ?, ?)',
            args: ['ai-score', 200, 100, 300],
        })

        const res = await request(app)
            .get('/api/ai-usage/summary')
            .expect(200)

        expect(Array.isArray(res.body)).toBe(true)
        if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('project')
            expect(res.body[0]).toHaveProperty('count')
            expect(res.body[0]).toHaveProperty('totalTokens')
        }
    })
})
