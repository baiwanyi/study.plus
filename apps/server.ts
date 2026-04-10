import express, { type Express, type Request, type Response } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __dirname: string = path.dirname(fileURLToPath(import.meta.url))

dotenv.config({ path: path.resolve(__dirname, '../.env') })

import tasksRouter from './routes/tasks'
import pointsRouter from './routes/points'
import exchangesRouter from './routes/exchanges'
import rulesRouter from './routes/rules'
import aiUsageRouter from './routes/ai-usage'

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
app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
        autosaveInterval: Number(process.env.AUTOSAVE_INTERVAL) || 10,
    })
})

// Serve React client in production
const clientDist = path.resolve(__dirname, '../dist')
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
