import { Router, type Request, type Response } from 'express'
import { db, client } from '../db/index'
import { options } from '../db/schema'
import { eq } from 'drizzle-orm'
import type { ApiErrorResponse } from '@shared/types'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
    try {
        const optionData = await db.select().from(options)
        const result: Record<string, unknown> = {}
        for (const option of optionData) {
            try {
                result[option.key] = JSON.parse(option.value as string)
            } catch {
                result[option.key] = option.value
            }
        }
        res.json(result)
    } catch (err) {
        console.error('Failed to get rules:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.get('/:key', async (req: Request<{ key: string }>, res: Response) => {
    try {
        const { key } = req.params
        const rows = await db.select().from(options).where(eq(options.key, key))
        const option = rows[0]
        if (!option) {
            res.status(404).json({ error: 'Rule not found' })
            return
        }
        try {
            res.json(JSON.parse(option.value as string))
        } catch {
            res.json(option.value)
        }
    } catch (err) {
        console.error('Failed to get rule:', err)
        res.status(500).json({ error: String(err) })
    }
})

router.put('/:key', async (req: Request<{ key: string }>, res: Response<{ success: boolean } | ApiErrorResponse>) => {
    const { key } = req.params
    const value = JSON.stringify(req.body)

    try {
        const rows = await db.select().from(options).where(eq(options.key, key))
        const strValue = String(value)
        if (rows.length > 0) {
            await client.execute({
                sql: 'UPDATE options SET value = ? WHERE key = ?',
                args: [strValue, key],
            })
        } else {
            await client.execute({
                sql: 'INSERT INTO options (key, value) VALUES (?, ?)',
                args: [key, strValue],
            })
        }
        res.json({ success: true })
    } catch (err) {
        console.error('Failed to update rule:', err)
        res.status(500).json({ error: String(err) })
    }
})

export default router
