import express, { type Express, type Request, type Response } from 'express'
import path from 'path'
import fs from 'fs'
import tasksRouter from './routes/tasks'
import pointsRouter from './routes/points'
import exchangesRouter from './routes/exchanges'
import rulesRouter from './routes/options'
import aiUsageRouter from './routes/ai-usage'
import videosRouter from './routes/videos'
import rssRouter from './routes/rss'
import weeklyRouter from './routes/weekly'
import { db } from './db/index'
import { options } from './db/schema'
import { eq } from 'drizzle-orm'
import { isFirstDayOfMonth } from './routes/advance-helper'

const app: Express = express()
const PORT: number = Number(process.env.PORT) || 3001

// Middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// API routes
app.use('/api/tasks', tasksRouter)
app.use('/api/points', pointsRouter)
app.use('/api/exchanges', exchangesRouter)
app.use('/api/ai-usage', aiUsageRouter)
app.use('/api/options', rulesRouter)
app.use('/api/videos', videosRouter)
app.use('/api/rss', rssRouter)
app.use('/api/weekly', weeklyRouter)

// List images in public/images/ directory for share background picker
app.get('/api/images', (_req: Request, res: Response) => {
    const imagesDir = path.resolve(import.meta.dirname, '..', '..', 'public', 'images')
    try {
        const files = fs
            .readdirSync(imagesDir)
            .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
            .sort()
            .map((f) => `/images/${f}`)
        res.json(files)
    } catch {
        res.json([])
    }
})

// Options endpoint (exposes safe client-side config)
app.get('/api/system', async (_req: Request, res: Response) => {
    const config: Record<string, unknown> = {
        autosaveInterval: 10,
        pageSize: 20,
    }
    try {
        const rows = await db
            .select()
            .from(options)
            .where(eq(options.key, 'system'))
        if (rows[0]) {
            const option = JSON.parse(rows[0].value) as Record<string, unknown>
            if (option.autosaveInterval !== undefined)
                config.autosaveInterval = Number(option.autosaveInterval)
            if (option.pageSize !== undefined)
                config.pageSize = Number(option.pageSize)
        }
    } catch (err) {
        console.error('Failed to load system config from DB:', err)
    }
    res.json(config)
})

// Serve React client in production
const clientDist = path.resolve(
    import.meta.dirname,
    '..',
    '..',
    process.env.DIST_PATH || 'dist',
)
app.use(express.static(clientDist))

// API 404 fallback — return JSON for unmatched API routes
app.all('/api/{*path}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' })
})

// SPA fallback — serve index.html for all other routes
app.get('/{*path}', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'))
})

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
    console.error('Unhandled error:', err)
    const isDEV = process.env.NODE_ENV !== 'production'
    res.status(500).json({
        error: isDEV ? err.message : 'Internal Server Error',
        ...(isDEV && { stack: err.stack }),
    })
})

// Setup monthly repayment task
function setupMonthlyRepayment(): void {
    const checkAndRepay = async () => {
        if (isFirstDayOfMonth()) {
            try {
                const res = await fetch(
                    `http://localhost:${PORT}/api/points/advances/repay`,
                    { method: 'POST' },
                )
                const result: { success: boolean; repaid: number } =
                    await res.json()
                if (result.success && result.repaid > 0) {
                    console.log(
                        `[Scheduled] 每月还款成功，共扣减 ${result.repaid} 积分`,
                    )
                }
            } catch (err) {
                console.error('[Scheduled] 每月还款任务执行失败:', err)
            }
        }
    }
    checkAndRepay()
    setInterval(checkAndRepay, 60 * 60 * 1000)
    console.log('[Scheduled] 每月还款定时任务已启动')
}

setupMonthlyRepayment()

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`)
}).on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
        console.error(
            `Port ${PORT} is already in use. Please free the port or set PORT environment variable to a different value.`,
        )
    } else {
        console.error('Server failed to start:', err)
    }
    process.exit(1)
})
