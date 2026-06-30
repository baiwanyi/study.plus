import { Router, type Request, type Response } from 'express'
import { db } from '../db/index'
import { aiUsageLogs } from '../db/schema'
import { desc, sql } from 'drizzle-orm'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
    const logs = await db
        .select()
        .from(aiUsageLogs)
        .orderBy(desc(aiUsageLogs.id))
    res.json(logs)
})

router.get('/summary', async (_req: Request, res: Response) => {
    const summary = await db
        .select({
            project: aiUsageLogs.project,
            count: sql<number>`count(*)`,
            totalPromptTokens: sql<number>`sum(${aiUsageLogs.promptTokens})`,
            totalCompletionTokens: sql<number>`sum(${aiUsageLogs.completionTokens})`,
            totalTokens: sql<number>`sum(${aiUsageLogs.totalTokens})`,
        })
        .from(aiUsageLogs)
        .groupBy(aiUsageLogs.project)
    res.json(summary)
})

export default router
