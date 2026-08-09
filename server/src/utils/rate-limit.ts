import rateLimit from 'express-rate-limit'
import type { Request, Response } from 'express'

// AI 类端点统一限流（防账单刷爆 / API Billing Burn）：每 IP 每小时 30 次
export const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: 'AI 调用过于频繁，请稍后再试' })
    },
})
