import express, { type Express, type Request, type Response } from 'express'
import path from 'path'
import tasksRouter from '@apps/routes/tasks'
import pointsRouter from '@apps/routes/points'
import exchangesRouter from '@apps/routes/exchanges'
import rulesRouter from '@apps/routes/rules'
import aiUsageRouter from '@apps/routes/ai-usage'
import { db } from '@apps/db/index'
import { ruleConfig } from '@apps/db/schema'
import { eq } from 'drizzle-orm'

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
app.use('/api/rules', rulesRouter)

// Config endpoint (exposes safe client-side config)
app.get('/api/config', async (_req: Request, res: Response) => {
    // Hardcoded fallbacks (env vars removed, all config comes from DB)
    const config: Record<string, unknown> = {
        autosaveInterval: 10,
        pageSize: 20,
    }
    // Override with DB values
    try {
        const rows = await db
            .select()
            .from(ruleConfig)
            .where(eq(ruleConfig.key, 'system'))
        if (rows[0]) {
            const sys = JSON.parse(rows[0].value) as Record<string, unknown>
            if (sys.autosaveInterval !== undefined)
                config.autosaveInterval = Number(sys.autosaveInterval)
            if (sys.pageSize !== undefined)
                config.pageSize = Number(sys.pageSize)
        }
    } catch (err) {
        console.error('Failed to load system config from DB:', err)
    }
    res.json(config)
})

// Serve React client in production
const clientDist = path.resolve(
    import.meta.dirname,
    process.env.DIST_PATH || 'dist',
)
app.use(express.static(clientDist))

// API 404 fallback — return JSON for unmatched API routes
app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' })
})

// SPA fallback — serve index.html for all other routes
app.get('*', (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'))
})

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: unknown) => {
    console.error('Unhandled error:', err)
    const isDev = process.env.NODE_ENV !== 'production'
    res.status(500).json({
        error: isDev ? err.message : 'Internal Server Error',
        ...(isDev && { stack: err.stack }),
    })
})

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`)
})
