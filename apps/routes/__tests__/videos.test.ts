// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import type { Express } from 'express'
import express from 'express'

vi.mock('@apps/db/index', async () => {
    const { createMockDb } = await import('./_helpers')
    const mod = await createMockDb('study-vid-test-')
    const client = mod.client as import('@libsql/client').Client
    // Add videos table (not in base helper)
    await client.execute(`CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL,
        title TEXT NOT NULL,
        md5 TEXT NOT NULL UNIQUE,
        views INTEGER NOT NULL DEFAULT 0,
        resume_time INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    return mod
})

import videosRouter from '@apps/routes/videos'
import { getClient } from './_helpers'

let app: Express

beforeAll(() => {
    app = express()
    app.use(express.json())
    app.use('/api/videos', videosRouter)
})

afterAll(async () => {
    const client = getClient()
    if (client) await client.close()
})

beforeEach(async () => {
    const client = getClient()
    if (client) {
        await client.execute('DELETE FROM videos')
    }
})

describe('GET /api/videos', () => {
    it('空列表应返回空数组', async () => {
        const res = await request(app).get('/api/videos').expect(200)
        expect(Array.isArray(res.body)).toBe(true)
        expect(res.body.length).toBe(0)
    })
})

describe('GET /api/videos/:md5', () => {
    it('不存在的 MD5 应返回 404', async () => {
        await request(app)
            .get('/api/videos/00000000000000000000000000000000')
            .expect(404)
    })
})

describe('CRUD 操作', () => {
    const videoMd5 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    beforeEach(async () => {
        const client = getClient()!
        await client.execute({
            sql: 'INSERT INTO videos (path, title, md5) VALUES (?, ?, ?)',
            args: ['/videos/test.mp4', '测试视频', videoMd5],
        })
    })

    it('GET /api/videos 应返回列表', async () => {
        const res = await request(app).get('/api/videos').expect(200)
        expect(res.body.length).toBe(1)
        expect(res.body[0].title).toBe('测试视频')
    })

    it('GET /api/videos/:md5 应返回详情', async () => {
        const res = await request(app)
            .get(`/api/videos/${videoMd5}`)
            .expect(200)

        expect(res.body.md5).toBe(videoMd5)
        expect(res.body.title).toBe('测试视频')
        expect(res.body.path).toBe('/videos/test.mp4')
    })

    it('PUT /api/videos/:md5 应更新标题', async () => {
        const res = await request(app)
            .put(`/api/videos/${videoMd5}`)
            .send({ title: '新标题' })
            .expect(200)

        expect(res.body.title).toBe('新标题')
    })

    it('PUT /api/videos/:md5 缺标题应返回 400', async () => {
        await request(app)
            .put(`/api/videos/${videoMd5}`)
            .send({ title: '' })
            .expect(400)
    })

    it('POST /api/videos/:md5/view 应增加浏览次数', async () => {
        const res = await request(app)
            .post(`/api/videos/${videoMd5}/view`)
            .expect(200)

        expect(res.body.success).toBe(true)

        const detail = await request(app)
            .get(`/api/videos/${videoMd5}`)
            .expect(200)
        expect(detail.body.views).toBe(1)
    })
})
