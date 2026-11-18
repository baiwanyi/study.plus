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

// Unsplash 搜索专用限流：保护第三方 API 配额，避免搜索接口被当成免费图库爬虫
export const unsplashLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: '图片搜索过于频繁，请稍后再试' })
    },
})

// 题库解题思路专用限流：整卷逐题求助属于正常用法（单卷可达 30+ 题），
// 故上限高于通用 AI 限额；重复点击同一题命中服务端缓存，实际计费请求远少于请求数
export const libraryHintLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: '解题思路生成过于频繁，请稍后再试' })
    },
})
