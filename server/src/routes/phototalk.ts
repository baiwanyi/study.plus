/**
 * 看图说话 REST 路由：Unsplash 搜索与采集、本地图片读取、描述评分与历史查询。
 * 复用约定：zod 统一校验入参，Drizzle 负责持久化，AI 能力经 services/ai 调用，
 * 图片读写经 services/unsplash 收口；响应一律显式构造 DTO，禁止返回数据库实体。
 * 关键约束：全部接口需 X-API-Key；搜索挂独立限流保护第三方配额，评分挂 aiLimiter 防账单刷爆；
 * 只接收图片 ID 不接收任意 URL，文件读取前校验文件名白名单，AI 输出经二次钳制后才落库。
 */
import { desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import type {
    ApiErrorResponse,
    PictureDetail,
    PictureImageListItem,
    PictureImageRecord,
    PictureScoreResult,
    PictureSearchItem,
    PictureSubmissionRecord,
} from '@shared/types'
import { db } from '../db/index'
import { pictureImages, phototalkSubmissions } from '../db/schema'
import { generatePictureKeywords, scorePictureDescription } from '../services/ai'
import {
    fetchAndSavePhoto,
    readLocalImageAsDataUrl,
    resolveExistingPhoto,
    searchPhotos,
    UnsplashUnavailableError,
} from '../services/unsplash'
import { aiLimiter, unsplashLimiter } from '../utils/rate-limit'

const router = Router()

const searchSchema = z.object({
    query: z.string().trim().min(1, '搜索关键词不能为空').max(100, '搜索关键词过长'),
    page: z.coerce.number().int().min(1).max(50).default(1),
    perPage: z.coerce.number().int().min(1).max(20).default(12),
})

const saveSchema = z.object({
    unsplashId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/, '图片 ID 格式不合法'),
})

const draftSchema = z.object({
    content: z.string().trim().max(2000, '草稿最多 2000 个字'),
})

const scoreSchema = z.object({
    imageId: z.number().int().positive('图片 ID 不合法'),
    content: z
        .string()
        .trim()
        .min(100, '描述至少 100 个字才能评分')
        .max(2000, '描述最多 2000 个字'),
})

const historySchema = z.object({
    imageId: z.coerce.number().int().positive().optional(),
})

type ImageRow = typeof pictureImages.$inferSelect
type SubmissionRow = typeof phototalkSubmissions.$inferSelect

function parseKeywords(raw: string | null): string[] {
    if (!raw) return []
    try {
        const value: unknown = JSON.parse(raw)
        return Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : []
    } catch {
        return []
    }
}

function parseScoreResult(raw: string | null): PictureScoreResult | null {
    if (!raw) return null
    try {
        const value: unknown = JSON.parse(raw)
        return typeof value === 'object' && value !== null && !Array.isArray(value)
            ? (value as PictureScoreResult)
            : null
    } catch {
        return null
    }
}

function toImageRecord(row: ImageRow): PictureImageRecord {
    return {
        id: row.id,
        unsplashId: row.unsplashId,
        filePath: row.filePath,
        width: row.width,
        height: row.height,
        sourceDescription: row.sourceDescription,
        thumbnailUrl: row.thumbnailUrl,
        draftContent: row.draftContent,
        keywords: parseKeywords(row.keywords),
        createdAt: row.createdAt,
    }
}

function toSubmissionRecord(row: SubmissionRow): PictureSubmissionRecord {
    return {
        id: row.id,
        imageId: row.imageId,
        content: row.content,
        score: row.score,
        aiResult: parseScoreResult(row.aiResult),
        scoredAt: row.scoredAt,
        createdAt: row.createdAt,
    }
}

function respondServiceError<T>(
    res: Response<T | ApiErrorResponse>,
    error: unknown,
    fallback: string,
): void {
    if (error instanceof UnsplashUnavailableError) {
        res.status(503).json({ error: error.message })
        return
    }
    const message = error instanceof Error ? error.message : fallback
    console.warn('[PhotoTalk] 服务调用失败:', message)
    if (error instanceof Error && 'cause' in error && error.cause) {
        console.error('[PhotoTalk] 数据库底层错误:', error.cause)
    }
    res.status(502).json({ error: message || fallback })
}

async function findImageById(id: number): Promise<ImageRow | null> {
    const rows = await db
        .select()
        .from(pictureImages)
        .where(eq(pictureImages.id, id))
        .limit(1)
    return rows[0] ?? null
}

/** 搜索 Unsplash 候选图片；缩略图由服务端映射，前端不接触 Access Key */
router.get(
    '/search',
    unsplashLimiter,
    async (req: Request, res: Response<PictureSearchItem[] | ApiErrorResponse>) => {
        const parsed = searchSchema.safeParse(req.query)
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? '搜索参数不合法' })
            return
        }
        try {
            const items = await searchPhotos(
                parsed.data.query,
                parsed.data.page,
                parsed.data.perPage,
            )
            res.json(items)
        } catch (error: unknown) {
            respondServiceError(res, error, '图片搜索失败')
        }
    },
)

/** 采集选中的图片：已入库直接返回，文件已存在则复用并补生成关键词 */
router.post(
    '/images',
    async (req: Request, res: Response<PictureImageRecord | ApiErrorResponse>) => {
        const parsed = saveSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? '图片 ID 不合法' })
            return
        }
        const { unsplashId } = parsed.data

        try {
            const existing = await db
                .select()
                .from(pictureImages)
                .where(eq(pictureImages.unsplashId, unsplashId))
                .limit(1)
            if (existing[0]) {
                res.json(toImageRecord(existing[0]))
                return
            }

            const existFile = resolveExistingPhoto(unsplashId)
            const saved = existFile ?? (await fetchAndSavePhoto(unsplashId))
            const imageDataUrl = saved.imageBuffer.length > 0
                ? `data:image/jpeg;base64,${saved.imageBuffer.toString('base64')}`
                : await readLocalImageAsDataUrl(saved.filePath)

            const keywords = await generatePictureKeywords(
                imageDataUrl,
                saved.sourceDescription,
            )
            const [row] = await db
                .insert(pictureImages)
                .values({
                    unsplashId,
                    filePath: saved.filePath,
                    width: saved.width,
                    height: saved.height,
                    sourceDescription: saved.sourceDescription,
                    thumbnailUrl: saved.thumbnailUrl,
                    keywords: JSON.stringify(keywords),
                })
                .onConflictDoNothing()
                .returning()

            const finalRow = row ?? (
                await db
                    .select()
                    .from(pictureImages)
                    .where(eq(pictureImages.unsplashId, unsplashId))
                    .limit(1)
            )[0]
            if (!finalRow) {
                throw new Error('图片入库失败，请稍后重试')
            }
            res.json(toImageRecord(finalRow))
        } catch (error: unknown) {
            respondServiceError(res, error, '图片采集失败')
        }
    },
)

/** 已采集图片清单：附带是否已描述与最近一次评分，供列表页直接展示状态 */
router.get(
    '/images',
    async (_req: Request, res: Response<PictureImageListItem[] | ApiErrorResponse>) => {
        try {
            const rows = await db
                .select()
                .from(pictureImages)
                .orderBy(desc(pictureImages.createdAt))
                .limit(200)
            const submissionRows = await db
                .select({
                    imageId: phototalkSubmissions.imageId,
                    content: phototalkSubmissions.content,
                    score: phototalkSubmissions.score,
                    scoredAt: phototalkSubmissions.scoredAt,
                    createdAt: phototalkSubmissions.createdAt,
                })
                .from(phototalkSubmissions)
                .orderBy(desc(phototalkSubmissions.createdAt))
                .limit(1000)

            // 提交按时间倒序，首次出现的图片即为最近一次描述；不展开全部历史。
            const latestByImage = new Map<
                number,
                { content: string; score: number | null; scoredAt: string | null }
            >()
            for (const item of submissionRows) {
                if (latestByImage.has(item.imageId)) continue
                latestByImage.set(item.imageId, {
                    content: item.content,
                    score: item.score,
                    scoredAt: item.scoredAt ?? item.createdAt,
                })
            }

            const items: PictureImageListItem[] = await Promise.all(
                rows.map(async (row) => {
                    const latest = latestByImage.get(row.id)
                    let thumbnailDataUrl = ''
                    try {
                        thumbnailDataUrl = await readLocalImageAsDataUrl(row.filePath)
                    } catch (error: unknown) {
                        const message = error instanceof Error ? error.message : String(error)
                        console.warn('[PhotoTalk] 读取本地图片失败:', row.filePath, message)
                    }
                    return {
                        ...toImageRecord(row),
                        thumbnailDataUrl,
                        described: latest !== undefined,
                        lastContent: latest?.content ?? null,
                        lastScore: latest?.score ?? null,
                        lastScoredAt: latest?.scoredAt ?? null,
                    }
                }),
            )
            res.json(items)
        } catch (error: unknown) {
            respondServiceError(res, error, '读取图片列表失败')
        }
    },
)

/** 单图详情：图片本体以 data URL 返回，配合既有 CSP img-src data: 直接渲染 */
router.get(
    '/images/:id',
    async (req: Request<{ id: string }>, res: Response<PictureDetail | ApiErrorResponse>) => {
        const imageId = Number(req.params.id)
        if (!Number.isInteger(imageId) || imageId <= 0) {
            res.status(400).json({ error: '图片 ID 不合法' })
            return
        }
        try {
            const row = await findImageById(imageId)
            if (!row) {
                res.status(404).json({ error: '图片不存在' })
                return
            }
            const imageDataUrl = await readLocalImageAsDataUrl(row.filePath)
            const submissionRows = await db
                .select()
                .from(phototalkSubmissions)
                .where(eq(phototalkSubmissions.imageId, imageId))
                .orderBy(desc(phototalkSubmissions.createdAt))
                .limit(1)
            const lastSubmission = submissionRows[0]
                ? toSubmissionRecord(submissionRows[0])
                : null
            res.json({ ...toImageRecord(row), imageDataUrl, lastSubmission })
        } catch (error: unknown) {
            respondServiceError(res, error, '读取图片失败')
        }
    },
)

/** 保存描述草稿：供练习页手动保存与防抖自动保存调用，不产生评分记录 */
router.put(
    '/images/:id/draft',
    async (
        req: Request<{ id: string }>,
        res: Response<{ saved: boolean } | ApiErrorResponse>,
    ) => {
        const imageId = Number(req.params.id)
        if (!Number.isInteger(imageId) || imageId <= 0) {
            res.status(400).json({ error: '图片 ID 不合法' })
            return
        }
        const parsed = draftSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? '草稿内容不合法' })
            return
        }
        try {
            const row = await findImageById(imageId)
            if (!row) {
                res.status(404).json({ error: '图片不存在' })
                return
            }
            await db
                .update(pictureImages)
                .set({ draftContent: parsed.data.content })
                .where(eq(pictureImages.id, imageId))
            res.json({ saved: true })
        } catch (error: unknown) {
            respondServiceError(res, error, '保存草稿失败')
        }
    },
)

/** 提交描述并评分：一次提交即一次 AI 计费，非 Network 错误也须显式提示 */
router.post(
    '/score',
    aiLimiter,
    async (req: Request, res: Response<{
        submission: PictureSubmissionRecord
        aiResult: PictureScoreResult
    } | ApiErrorResponse>) => {
        const parsed = scoreSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues[0]?.message ?? '提交内容不合法' })
            return
        }
        const { imageId, content } = parsed.data

        try {
            const row = await findImageById(imageId)
            if (!row) {
                res.status(404).json({ error: '图片不存在' })
                return
            }
            const imageDataUrl = await readLocalImageAsDataUrl(row.filePath)
            const aiResult = await scorePictureDescription(
                imageDataUrl,
                parseKeywords(row.keywords),
                content,
            )
            const scoredAt = new Date().toISOString()
            const [submission] = await db
                .insert(phototalkSubmissions)
                .values({
                    imageId,
                    content,
                    score: aiResult.totalScore,
                    aiResult: JSON.stringify(aiResult),
                    scoredAt,
                })
                .returning()
            if (!submission) {
                throw new Error('评分记录写入失败')
            }
            res.json({
                submission: toSubmissionRecord(submission),
                aiResult,
            })
        } catch (error: unknown) {
            respondServiceError(res, error, 'AI 评分失败')
        }
    },
)

/** 练习历史：可按图片过滤，最多返回最近 100 条 */
router.get(
    '/submissions',
    async (req: Request, res: Response<PictureSubmissionRecord[] | ApiErrorResponse>) => {
        const parsed = historySchema.safeParse(req.query)
        if (!parsed.success) {
            res.status(400).json({ error: '图片 ID 不合法' })
            return
        }
        try {
            const query = db
                .select()
                .from(phototalkSubmissions)
                .orderBy(desc(phototalkSubmissions.createdAt))
                .limit(100)
            const rows = parsed.data.imageId === undefined
                ? await query
                : await query.where(
                      eq(phototalkSubmissions.imageId, parsed.data.imageId),
                  )
            res.json(rows.map(toSubmissionRecord))
        } catch (error: unknown) {
            respondServiceError(res, error, '读取练习历史失败')
        }
    },
)

export { router as phototalkRouter }
