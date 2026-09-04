/**
 * Express 应用入口：安全中间件、API 路由注册、前端静态资源托管与生产启动逻辑。
 * 路径统一由 paths 模块按 APP_ROOT 解析，静态资源目录可通过 DIST_PATH 覆盖。
 * 启动副作用（API Key 校验、定时任务、端口监听）收口在 isMain 守卫中，
 * 避免被集成测试 import 时触发 process.exit / 端口占用 / 后台定时器。
 */
import cors from 'cors'
import helmet from 'helmet'
import { eq } from 'drizzle-orm'
import express from 'express'
import rateLimit from 'express-rate-limit'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { NextFunction, Request, Response } from 'express'
import { DB_FILE_PATH, db } from './db/index'
import { options } from './db/schema'
import { resolveFromClientRoot } from './paths'
import { isFirstDayOfMonth, repayActiveAdvances } from './routes/advance-helper'
import { aiUsageRouter } from './routes/ai-usage'
import { exchangesRouter } from './routes/exchanges'
import { lessonsRouter } from './routes/lessons'
import { rulesRouter } from './routes/options'
import { pointsRouter } from './routes/points'
import { rssRouter } from './routes/rss'
import { studynotesRouter } from './routes/studynotes'
import { tasksRouter } from './routes/tasks'
import { videosRouter } from './routes/videos'
import { weeklyRouter } from './routes/weekly'
import {
    readBackupConfig,
    runDailyBackup,
    shouldRunBackup,
    toDateKey,
} from './services/backup'
import { readMailConfig } from './services/mailer'

// 安全默认：未显式声明 NODE_ENV=development 时，按生产环境处理
// （生产环境禁止向客户端返回错误堆栈，见全局错误处理器）。
process.env.NODE_ENV ||= 'production'

// 导出 app 以便集成测试通过 supertest 直接驱动，无需真实监听端口。
// 生产启动逻辑（API Key 校验、定时任务、listen）统一收口在 import.meta.main
// 守卫中，避免被测试 import 时触发 process.exit / 端口占用 / 后台定时器。
export const app = express()
const PORT = Number(process.env.PORT) || 3006
// 前端构建产物目录：与 Vite 的 outDir（deploy/dist）保持一致，可用 DIST_PATH 覆盖。
const clientDist = resolveFromClientRoot(process.env.DIST_PATH || 'dist')
// import.meta.main 仅 Node 24.2+ 提供；低版本下回落到入口路径比对，
// 否则 isMain 恒为 undefined，会导致 API Key 校验与端口监听被整体跳过。
const isMain =
    import.meta.main ??
    (process.argv[1] !== undefined &&
        path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))

// Security headers via helmet (covers X-Content-Type-Options,
// X-Frame-Options, Referrer-Policy, etc.). HSTS is NOT managed by helmet
// here — it is set by a dedicated middleware below only when the actual
// connection is already TLS, so an HTTP/LAN deployment never locks the
// browser into HTTPS (which would otherwise break frame navigations on
// plain HTTP).
// CSP is also NOT managed by helmet: helmet v8 hardcodes
// `upgrade-insecure-requests` into its default CSP, which forces the
// browser to rewrite every http:// resource reference to https://. On a
// pure-LAN HTTP deployment (http://192.168.x.x:3006, no TLS) that upgrade
// makes the browser request https://192.168.x.x:3006/assets/* and fail
// with ERR_SSL_PROTOCOL_ERROR. We therefore set CSP ourselves below
// (without that directive) for full control.
app.use(
    helmet({
        // 关闭 helmet 自带的 HSTS，改由下方手动中间件条件发送（仅真 TLS 时）。
        strictTransportSecurity: false,
        // 关闭 helmet 自动 CSP，改由下方中间件手动下发（不含 upgrade-insecure-requests）。
        contentSecurityPolicy: false,
        // 禁用 COOP 和 Origin-Agent-Cluster：它们在 HTTP 非 localhost 源上
        // 被浏览器直接忽略（不可信源），且会触发控制台警告。
        crossOriginOpenerPolicy: false,
        originAgentCluster: false,
    }),
)

// 手动 CSP 中间件：内容与原本 directives 一致，但明确不含
// upgrade-insecure-requests，避免局域网 HTTP 下静态资源被强制升级为 https。
const CONTENT_SECURITY_POLICY = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' https: data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
].join('; ')
app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY)
    next()
})

// HSTS — 仅在显式开启且连接确为 TLS 时下发。
// 本项目为纯局域网 HTTP 部署（http://192.168.x.x:3006），不启用 HTTPS，
// 因此默认关闭 HSTS。否则浏览器一旦记下该主机的 HSTS 策略，会把后续
// http://IP:3006 请求强制升级为 https，撞上无 TLS 的 server 而报
// ERR_SSL_PROTOCOL_ERROR，局域网直连即无法访问。
// 仅在确有真实 TLS 终端（如前置代理终止 HTTPS）时，将 ENABLE_HSTS=true
// 打开；此时仍要求请求本身携带 https 标记，避免对明文回源误发 HSTS。
const ENABLE_HSTS = process.env.ENABLE_HSTS === 'true'
app.use((req: Request, res: Response, next: NextFunction) => {
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https'
    if (ENABLE_HSTS && isSecure) {
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

// API key authentication — fail-fast if API_KEY is not configured at startup.
// Every non-public API endpoint must present a matching X-API-Key header.
// 注意：process.exit(1) 仅在直接以主模块运行（生产启动）时执行；
// 被测试 import 时不触发，避免测试进程直接退出。
const API_KEY = process.env.API_KEY

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
    const provided =
        req.header('X-API-Key') ||
        req.header('Authorization')?.replace(/^Bearer\s+/i, '') ||
        ''
    if (!provided || provided !== API_KEY) {
        res.status(401).json({ error: '未授权：缺少或无效的 API Key' })
        return
    }
    next()
}

// API routes — protected by API key (except the public read-only config endpoints)
app.use('/api/tasks', requireApiKey, tasksRouter)
app.use('/api/points', requireApiKey, pointsRouter)
app.use('/api/exchanges', requireApiKey, exchangesRouter)
app.use('/api/lessons', requireApiKey, lessonsRouter)
app.use('/api/ai-usage', requireApiKey, aiUsageRouter)
app.use('/api/options', requireApiKey, rulesRouter)
app.use('/api/videos', requireApiKey, videosRouter)
app.use('/api/rss', requireApiKey, rssRouter)
app.use('/api/weekly', requireApiKey, weeklyRouter)
app.use('/api/study', requireApiKey, studynotesRouter)

// List images in public/images/ directory for share background picker
app.get('/api/images', async (_req: Request, res: Response) => {
    // 分享背景图随 Vite 构建一并输出到 dist/images，开发与部署共用同一目录。
    const imagesDir = path.join(clientDist, 'images')
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
app.use(express.static(clientDist))

// API 404 fallback — return JSON for unmatched API routes
app.all('/api/{*path}', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' })
})

// SPA fallback — serve index.html for all other routes
app.get('/{*path}', (_req: Request, res: Response, next: NextFunction) => {
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
        if (err) {
            next(err)
        }
    })
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

// Setup daily database backup.
// 与月度还款同一范式：每小时巡检 + 日期守卫，保证每日至多一份；
// 启动晚于触发时刻时延迟补发一次，适配非全天开机的家庭服务器。
// 仅「发送失败」不写入已执行日期，允许后续 tick 在当天重试；
// 「附件超限」属于不会自行恢复的状态，重试无意义，故一并标记完成。
let lastBackupDate = ''

function setupDailyBackup(): void {
    const backupConfig = readBackupConfig(DB_FILE_PATH)
    if (!backupConfig) {
        return
    }
    const mailConfig = readMailConfig()
    if (!mailConfig) {
        return
    }
    const checkAndBackup = async () => {
        const now = new Date()
        if (!shouldRunBackup(lastBackupDate, now, backupConfig)) {
            return
        }
        const result = await runDailyBackup(backupConfig, mailConfig, now)
        if (result.status === 'sent') {
            console.log('[Backup] 每日数据库备份已发送')
        }
        if (result.status !== 'failed') {
            lastBackupDate = toDateKey(now)
        }
    }
    setTimeout(checkAndBackup, 30 * 1000)
    setInterval(checkAndBackup, 60 * 60 * 1000)
    const trigger = `${String(backupConfig.triggerHour).padStart(2, '0')}:${String(backupConfig.triggerMinute).padStart(2, '0')}`
    console.log(`[Scheduled] 每日数据库备份定时任务已启动，触发时刻 ${trigger}`)
}

// 以下为生产启动逻辑：仅当以主模块直接运行（node/bun server/src/index.ts）时执行。
// 被测试 import 时 isMain 为 false，跳过定时任务与端口监听，避免污染测试环境。
if (isMain) {
    if (!API_KEY) {
        console.error(
            'FATAL: 环境变量 API_KEY 未设置。出于安全考虑，服务器拒绝在无认证的情况下启动。',
        )
        process.exit(1)
    }
    setupMonthlyRepayment()
    setupDailyBackup()

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
}
