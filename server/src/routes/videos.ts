import { Router, type Request, type Response } from 'express'
import { db, client } from '../db/index'
import { videos } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { ApiErrorResponse } from '@shared/types'

const router = Router()

const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm',
])

function scanDirectory(dir: string): string[] {
    const results: string[] = []
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            results.push(...scanDirectory(fullPath))
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase()
            if (VIDEO_EXTENSIONS.has(ext)) {
                results.push(fullPath)
            }
        }
    }
    return results
}

function computeMD5(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5')
        const stream = fs.createReadStream(filePath)
        stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
        stream.on('end', () => resolve(hash.digest('hex')))
        stream.on('error', reject)
    })
}

router.get('/', async (req: Request, res: Response) => {
    try {
        const limit = Number(req.query.limit) || 0
        const favorite = Number(req.query.favorite) || 0
        let query = 'SELECT * FROM videos'
        const conditions: string[] = []
        if (favorite === 1) conditions.push('favorite = 1')
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ')
        query += ' ORDER BY created_at'
        if (limit > 0) query += ` LIMIT ${limit}`
        const { rows } = await client.execute(query)
        const list = rows.map((r) => ({
            id: r.id as number,
            path: r.path as string,
            title: r.title as string,
            md5: r.md5 as string,
            views: r.views as number,
            resumeTime: r.resume_time as number,
            favorite: r.favorite as number,
            createdAt: r.created_at as string,
        }))
        res.json(list)
    } catch (err) {
        console.error('获取视频列表失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.get('/:md5', async (req: Request<{ md5: string }>, res: Response) => {
    try {
        const { md5 } = req.params
        const rows = await db
            .select()
            .from(videos)
            .where(eq(videos.md5, md5))
            .limit(1)
        if (!rows[0]) {
            res.status(404).json({ error: '视频未找到' })
            return
        }
        res.json(rows[0])
    } catch (err) {
        console.error('获取视频详情失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.post('/scan', async (_req: Request, res: Response) => {
    try {
        const optionRow = await client.execute({
            sql: "SELECT value FROM options WHERE key = 'system'",
            args: [],
        })
        const systemConfig = optionRow.rows[0]?.value
            ? (JSON.parse(optionRow.rows[0].value as string) as Record<string, unknown>)
            : {}
        const videoDir = (systemConfig.videoDirectory as string | undefined) || ''
        if (!videoDir || !fs.existsSync(videoDir)) {
            res.status(400).json({
                error: '视频目录未配置或不存在，请在系统设置中配置',
            } satisfies ApiErrorResponse)
            return
        }

        const files = scanDirectory(videoDir)
        const total = files.length

        res.setHeader('Content-Type', 'application/x-ndjson')
        res.setHeader('Transfer-Encoding', 'chunked')
        res.flushHeaders()

        let newCount = 0
        let skipCount = 0
        const errors: string[] = []

        for (let i = 0; i < total; i++) {
            const filePath = files[i]
            try {
                const md5 = await computeMD5(filePath)
                const existing = await db
                    .select({ id: videos.id })
                    .from(videos)
                    .where(eq(videos.md5, md5))
                    .limit(1)
                if (existing.length > 0) {
                    skipCount++
                } else {
                    const fileName = path.basename(filePath, path.extname(filePath))
                    await db.insert(videos).values({
                        path: filePath,
                        title: fileName,
                        md5,
                    })
                    newCount++
                }
            } catch (err) {
                errors.push(`${filePath}: ${(err as Error).message}`)
            }
            res.write(JSON.stringify({ type: 'progress', current: i + 1, total }) + '\n')
        }

        let deletedCount = 0
        try {
            const allVideos = await db.select({ id: videos.id, path: videos.path }).from(videos)
            for (const v of allVideos) {
                if (!fs.existsSync(v.path)) {
                    await db.delete(videos).where(eq(videos.id, v.id))
                    deletedCount++
                }
            }
        } catch (err) {
            errors.push(`清理失效记录失败: ${(err as Error).message}`)
        }

        res.write(JSON.stringify({
            type: 'complete',
            total,
            new: newCount,
            skipped: skipCount,
            deleted: deletedCount,
            errors,
        }) + '\n')
        res.end()
    } catch (err) {
        if (!res.headersSent) {
            res.status(500).json({ error: String(err) })
        } else {
            res.write(JSON.stringify({ type: 'error', message: String(err) }) + '\n')
            res.end()
        }
    }
})

router.put(
    '/:md5',
    async (
        req: Request<{ md5: string }, unknown, { title: string }>,
        res: Response,
    ) => {
        try {
            const { md5 } = req.params
            const { title } = req.body
            if (!title || typeof title !== 'string') {
                res.status(400).json({ error: '标题不能为空' })
                return
            }
            const rows = await db
                .update(videos)
                .set({ title })
                .where(eq(videos.md5, md5))
                .returning()
            if (!rows[0]) {
                res.status(404).json({ error: '视频未找到' })
                return
            }
            res.json(rows[0])
        } catch (err) {
            console.error('更新视频标题失败:', err)
            res.status(500).json({ error: String(err) })
        }
    },
)

router.post('/:md5/view', async (req: Request<{ md5: string }>, res: Response) => {
    try {
        const { md5 } = req.params
        const rows = await db
            .update(videos)
            .set({ views: sql`views + 1` })
            .where(eq(videos.md5, md5))
            .returning()
        if (!rows[0]) {
            res.status(404).json({ error: '视频未找到' })
            return
        }
        res.json({ success: true })
    } catch (err) {
        console.error('增加浏览次数失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.get('/stream/:md5', async (req: Request<{ md5: string }>, res: Response) => {
    try {
        const { md5 } = req.params
        const rows = await db
            .select()
            .from(videos)
            .where(eq(videos.md5, md5))
            .limit(1)
        if (!rows[0]) {
            res.status(404).json({ error: '视频未找到' })
            return
        }

        const filePath = rows[0].path
        if (!fs.existsSync(filePath)) {
            res.status(404).json({ error: '视频文件不存在' })
            return
        }

        const stat = fs.statSync(filePath)
        const fileSize = stat.size
        const ext = path.extname(filePath).toLowerCase()

        const mimeTypes: Record<string, string> = {
            '.mp4': 'video/mp4',
            '.avi': 'video/x-msvideo',
            '.mkv': 'video/x-matroska',
            '.mov': 'video/quicktime',
            '.wmv': 'video/x-ms-wmv',
            '.flv': 'video/x-flv',
            '.webm': 'video/webm',
        }
        const contentType = mimeTypes[ext] || 'video/mp4'

        const range = req.headers.range
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-')
            const start = parseInt(parts[0], 10)
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
            const chunkSize = end - start + 1

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
            })
            const stream = fs.createReadStream(filePath, { start, end })
            stream.pipe(res)
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': contentType,
            })
            fs.createReadStream(filePath).pipe(res)
        }
    } catch (err) {
        console.error('流式传输视频失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.put('/:md5/resume-time', async (req: Request<{ md5: string }, unknown, { time: number }>, res: Response) => {
    try {
        const { md5 } = req.params
        const { time } = req.body
        await db.update(videos).set({ resumeTime: Math.max(0, time) }).where(eq(videos.md5, md5))
        res.json({ success: true })
    } catch (err) {
        console.error('保存播放进度失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.post('/:md5/toggle-favorite', async (req: Request<{ md5: string }>, res: Response) => {
    try {
        const { md5 } = req.params
        const rows = await db.select({ favorite: videos.favorite }).from(videos).where(eq(videos.md5, md5)).limit(1)
        if (!rows[0]) {
            res.status(404).json({ error: '视频未找到' })
            return
        }
        const newFav = rows[0].favorite ? 0 : 1
        const updated = await db.update(videos).set({ favorite: newFav }).where(eq(videos.md5, md5)).returning()
        res.json(updated[0])
    } catch (err) {
        console.error('切换收藏失败:', err)
        res.status(500).json({ error: String(err) })
    }
})

export default router
