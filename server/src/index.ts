import cors from 'cors'
import { eq } from 'drizzle-orm'
import express from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'fs'
import path from 'path'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db/index'
import { options } from './db/schema'
import { isFirstDayOfMonth, repayActiveAdvances } from './routes/advance-helper'
import { aiUsageRouter } from './routes/ai-usage'
import { exchangesRouter } from './routes/exchanges'
import { rulesRouter } from './routes/options'
import { pointsRouter } from './routes/points'
import { rssRouter } from './routes/rss'
import { feynmanRouter } from './routes/feynman'
import { tasksRouter } from './routes/tasks'
import { videosRouter } from './routes/videos'
import { weeklyRouter } from './routes/weekly'

const app = express()
const PORT = Number(process.env.PORT) || 3001

// Security headers via helmet (covers CSP, X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy). HSTS is NOT managed by helmet here —
// it is set by a dedicated middleware below only when the actual connection
// is already TLS, so an HTTP/LAN deployment never locks the browser into
// HTTPS (which would otherwise break frame navigations on plain HTTP).
// app.use(
//     helmet({
//         contentSecurityPolicy: {
//             directives: {
//                 // defaultSrc: ["'self'"],
//                 // imgSrc: ["'self'", 'data:'],
//                 // styleSrc: ["'self'"],
//                 // scriptSrc: ["'self'"],
//             },
//         },
//         // strictTransportSecurity: false,
//         // 禁用 COOP 和 Origin-Agent-Cluster：它们在 HTTP 非 localhost 源上
//         // 被浏览器直接忽略（不可信源），且会触发控制台警告。
//         // crossOriginOpenerPolicy: false,
//         // originAgentCluster: false,
//     }),
// )

// HSTS — only emit when the connection is genuinely TLS. On plain HTTP
// (e.g. LAN access via http://192.168.x.x:3006) we must not send
// Strict-Transport-Security, otherwise the browser upgrades every request
// to HTTPS and frame navigations fail with a protocol mismatch.
app.use((req: Request, res: Response, next: NextFunction) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    if (isSecure) {
        res.setHeader(
            'Strict-Transport-Security',
            'max-age=31536000; includeSubDomains',
        )
    }
    next()
})

// CORS — restrict to configured origins; deny cross-origin by default
// (the SPA is served by this same server, so same-origin is sufficient).
const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : false
app.use(cors({ origin: corsOrigins, credentials: Boolean(corsOrigins) }))

// Body parsers
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// General API rate limit (anti-abuse / DDoS protection)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: '请求过于频繁，请稍后再试' })
    },
})
app.use('/api/', apiLimiter)

// Stricter limit for AI endpoints (protect against billing burn)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: 'AI 调用过于频繁，请稍后再试' })
    },
})
app.use('/api/feynman/evaluate', aiLimiter)
app.use('/api/feynman/follow-up', aiLimiter)

// API routes
app.use('/api/tasks', tasksRouter)
app.use('/api/points', pointsRouter)
app.use('/api/exchanges', exchangesRouter)
app.use('/api/ai-usage', aiUsageRouter)
app.use('/api/options', rulesRouter)
app.use('/api/videos', videosRouter)
app.use('/api/rss', rssRouter)
app.use('/api/weekly', weeklyRouter)
app.use('/api/feynman', feynmanRouter)

// List images in public/images/ directory for share background picker
app.get('/api/images', async (_req: Request, res: Response) => {
    const imagesDir = path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'apps',
        'public',
        'images',
    )
    try {
        const files = (await fs.promises.readdir(imagesDir))
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
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', err)
    const isDEV = process.env.NODE_ENV !== 'production'
    res.status(500).json({
        error: isDEV ? err.message : 'Internal Server Error',
        ...(isDEV && { stack: err.stack }),
    })
})

// Setup monthly repayment task.
// Guard with the last-executed month so it runs at most once per calendar
// month. isFirstDayOfMonth() stays true for the WHOLE day on the 1st, and the
// task ticks every hour — without this guard it would repay one installment
// per hour (up to ~24 times), over-deducting points in a single day.
let lastRepaidMonth = ''

function setupMonthlyRepayment(): void {
    const checkAndRepay = async () => {
        if (!isFirstDayOfMonth()) return
        const currentMonth = new Date().toISOString().slice(0, 7)
        if (currentMonth === lastRepaidMonth) return
        try {
            const repaid = await repayActiveAdvances()
            lastRepaidMonth = currentMonth
            if (repaid > 0) {
                console.log(`[Scheduled] 每月还款成功，共扣减 ${repaid} 积分`)
            }
        } catch (err) {
            console.error('[Scheduled] 每月还款任务执行失败:', err)
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
