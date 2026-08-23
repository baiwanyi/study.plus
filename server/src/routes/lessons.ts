import { and, desc, eq, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { studynotesSubjectValues } from '@shared/utils'
import { db } from '../db/index'
import {
    studyLessons,
    studyPreviews,
    studyNotes,
    studyQuiz,
} from '../db/schema'
import { analyzePreview } from '../services/ai'
import { parsePosInt } from '../utils/param'
import { aiLimiter } from '../utils/rate-limit'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'

export const lessonsRouter = Router()

const VALID_SUBJECTS = new Set<string>(studynotesSubjectValues)

// JSON 字段可能损坏，解析失败时回退安全默认值，避免整个接口 500
function safeJsonParse<T>(raw: string | null, fallback: T | null): T | null {
    if (raw === null || raw === undefined) return fallback
    try {
        return JSON.parse(raw) as T
    } catch (error) {
        console.warn(
            '预习记录 JSON 字段解析失败，已回退默认值:',
            (error as Error).message,
        )
        return fallback
    }
}

// List lessons with aggregated preview/reflection/quiz status
lessonsRouter.get('/', async (req: Request, res: Response) => {
    try {
        const { subject } = req.query

        const filters: SQL[] = []
        if (
            subject &&
            typeof subject === 'string' &&
            VALID_SUBJECTS.has(subject)
        ) {
            filters.push(eq(studyLessons.subject, subject))
        }

        const lessons = await db
            .select()
            .from(studyLessons)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(studyLessons.createdAt))

        // 聚合预习状态（一对多→一对一）：仅查当前课程集合，避免全表扫描
        const lessonIds = lessons.map((l) => l.id)
        const previews = await db
            .select()
            .from(studyPreviews)
            .where(inArray(studyPreviews.lessonId, lessonIds))
        const previewMap = new Map(previews.map((p) => [p.lessonId, p]))

        // 聚合心得状态（一对一：同一课程最多一条已关联心得）：
        // 仅查当前课程集合，避免全表加载所有心得
        const notes = await db
            .select({
                id: studyNotes.id,
                lessonId: studyNotes.lessonId,
                evaluation: studyNotes.evaluation,
            })
            .from(studyNotes)
            .where(inArray(studyNotes.lessonId, lessonIds))
        const noteMap = new Map(notes.map((n) => [n.lessonId, n]))

        // 聚合测验分数：统一取自 study_quiz.score，不再使用 study_notes.quiz_score。
        // study_quiz.study_id 关联 lesson.id，直接按课程聚合最新一条测验分数（quizId 最大者为最新）。
        const quizzes = await db
            .select({
                lessonId: studyQuiz.studyId,
                score: studyQuiz.score,
                quizId: studyQuiz.id,
            })
            .from(studyQuiz)
            .where(inArray(studyQuiz.studyId, lessonIds))
        // 每个课程仅保留最新一条测验分数（quizId 最大者为最新）
        const latestQuizByLesson = new Map<number, { quizId: number; score: number | null }>()
        for (const q of quizzes) {
            const cur = latestQuizByLesson.get(q.lessonId)
            if (!cur || (q.quizId ?? 0) > cur.quizId) {
                latestQuizByLesson.set(q.lessonId, { quizId: q.quizId ?? 0, score: q.score })
            }
        }

        const result = lessons.map((lesson) => {
            const preview = previewMap.get(lesson.id)
            const note = noteMap.get(lesson.id)

            let previewScore: number | null = null
            if (preview?.aiAnalysis) {
                const parsed = safeJsonParse<{ completenessScore?: unknown }>(
                    preview.aiAnalysis,
                    null,
                )
                // 兼容 AI 返回字符串数字（如 '85'）或 number，统一归一为有限数字
                const raw = parsed?.completenessScore
                const num =
                    typeof raw === 'number'
                        ? raw
                        : typeof raw === 'string'
                          ? Number(raw)
                          : NaN
                if (parsed && Number.isFinite(num)) {
                    previewScore = num
                }
            }

            let studynoteScore: number | null = null
            if (note?.evaluation) {
                const parsed = safeJsonParse<{ completenessScore?: unknown }>(
                    note.evaluation,
                    null,
                )
                const raw = parsed?.completenessScore
                const num =
                    typeof raw === 'number'
                        ? raw
                        : typeof raw === 'string'
                          ? Number(raw)
                          : NaN
                if (parsed && Number.isFinite(num)) {
                    studynoteScore = num
                }
            }

            return {
                ...lesson,
                // 用 != null && !== '' 显式判断，避免字段为数字 0 或空串被 || 误判为未完成
                previewDone: Boolean(
                    preview &&
                    ((preview.content != null && preview.content !== '') ||
                        (preview.oldKnowledge != null &&
                            preview.oldKnowledge !== '') ||
                        (preview.questions != null &&
                            preview.questions !== '')),
                ),
                previewAnalyzed: Boolean(preview?.aiAnalysis),
                previewScore,
                studynoteId: note?.id ?? null,
                studynoteScore,
                quizScore: latestQuizByLesson.get(lesson.id)?.score ?? null,
            }
        })

        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error listing lessons:', message)
        res.status(500).json({ error: '获取课程列表失败' })
    }
})

// Create lesson
lessonsRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { subject, topic } = req.body

        if (
            typeof subject !== 'string' ||
            typeof topic !== 'string' ||
            !subject.trim() ||
            !topic.trim()
        ) {
            res.status(400).json({ error: '学科与课程名称为必填项' })
            return
        }

        if (!VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const now = new Date().toISOString()
        const rows = await db
            .insert(studyLessons)
            .values({
                subject,
                topic: topic.trim(),
                createdAt: now,
                updatedAt: now,
            })
            .returning()

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique/i.test(message)) {
            res.status(409).json({ error: '该学科下已存在同名课程' })
            return
        }
        console.error('Error creating lesson:', message)
        res.status(500).json({ error: '创建课程失败' })
    }
})

// Update lesson
lessonsRouter.put('/:id', async (req: Request, res: Response) => {
    try {
        const lessonId = parsePosInt(req.params.id)
        if (lessonId === -1) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const { subject, topic } = req.body
        if (
            typeof subject !== 'string' ||
            typeof topic !== 'string' ||
            !subject.trim() ||
            !topic.trim()
        ) {
            res.status(400).json({ error: '学科与课程名称为必填项' })
            return
        }

        if (!VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const rows = await db
            .update(studyLessons)
            .set({
                subject,
                topic: topic.trim(),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(studyLessons.id, lessonId))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '课程未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        if (/unique/i.test(message)) {
            res.status(409).json({ error: '该学科下已存在同名课程' })
            return
        }
        console.error('Error updating lesson:', message)
        res.status(500).json({ error: '编辑课程失败' })
    }
})

// Delete lesson (manually cascade preview/reflection/quiz, independent of PRAGMA foreign_keys)
lessonsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const lessonId = parsePosInt(req.params.id)
        if (lessonId === -1) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const deleted = await db.transaction(async (tx) => {
            await tx
                .delete(studyPreviews)
                .where(eq(studyPreviews.lessonId, lessonId))
            await tx
                .delete(studyQuiz)
                .where(eq(studyQuiz.studyId, lessonId))
            await tx.delete(studyNotes).where(eq(studyNotes.lessonId, lessonId))
            return tx
                .delete(studyLessons)
                .where(eq(studyLessons.id, lessonId))
                .returning()
        })

        if (!deleted[0]) {
            res.status(404).json({ error: '课程未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting lesson:', message)
        res.status(500).json({ error: '删除课程失败' })
    }
})

// Get lesson preview
lessonsRouter.get('/:id/preview', async (req: Request, res: Response) => {
    try {
        const lessonId = parsePosInt(req.params.id)
        if (lessonId === -1) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const lesson = await db
            .select()
            .from(studyLessons)
            .where(eq(studyLessons.id, lessonId))
            .limit(1)
        if (!lesson[0]) {
            res.status(404).json({ error: '课程未找到' })
            return
        }

        const rows = await db
            .select()
            .from(studyPreviews)
            .where(eq(studyPreviews.lessonId, lessonId))
            .limit(1)

        res.json({ preview: rows[0] ?? null })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting lesson preview:', message)
        res.status(500).json({ error: '获取预习失败' })
    }
})

// Save lesson preview (upsert)
lessonsRouter.post('/:id/preview', async (req: Request, res: Response) => {
    try {
        const lessonId = parsePosInt(req.params.id)
        if (lessonId === -1) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const { content, oldKnowledge, questions } = req.body
        if (
            (content !== undefined && typeof content !== 'string') ||
            (oldKnowledge !== undefined && typeof oldKnowledge !== 'string') ||
            (questions !== undefined && typeof questions !== 'string')
        ) {
            res.status(400).json({ error: '字段类型错误' })
            return
        }

        // 三个字段全部未提供视为空请求，避免写入一条全空预习记录导致 previewDone 误判
        if (
            content === undefined &&
            oldKnowledge === undefined &&
            questions === undefined
        ) {
            res.status(400).json({ error: '至少需要提供一个预习字段' })
            return
        }

        const lesson = await db
            .select()
            .from(studyLessons)
            .where(eq(studyLessons.id, lessonId))
            .limit(1)
        if (!lesson[0]) {
            res.status(404).json({ error: '课程未找到' })
            return
        }

        const existing = await db
            .select()
            .from(studyPreviews)
            .where(eq(studyPreviews.lessonId, lessonId))
            .limit(1)

        const now = new Date().toISOString()
        if (existing[0]) {
            // 内容变化时作废旧 AI 分析，避免后续 analyze 误复用旧结论
            const contentChanged =
                (content !== undefined && content !== existing[0].content) ||
                (oldKnowledge !== undefined &&
                    oldKnowledge !== existing[0].oldKnowledge) ||
                (questions !== undefined && questions !== existing[0].questions)
            const rows = await db
                .update(studyPreviews)
                .set({
                    ...(content !== undefined && { content }),
                    ...(oldKnowledge !== undefined && { oldKnowledge }),
                    ...(questions !== undefined && { questions }),
                    ...(contentChanged && {
                        aiAnalysis: null,
                        aiAnalyzedAt: null,
                    }),
                    updatedAt: now,
                })
                .where(eq(studyPreviews.id, existing[0].id))
                .returning()
            res.json(rows[0])
        } else {
            const now = new Date().toISOString()
            const rows = await db
                .insert(studyPreviews)
                .values({
                    lessonId,
                    content: content ?? '',
                    oldKnowledge: oldKnowledge ?? '',
                    questions: questions ?? '',
                    createdAt: now,
                    updatedAt: now,
                })
                .returning()
            res.json(rows[0])
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error saving lesson preview:', message)
        res.status(500).json({ error: '保存预习失败' })
    }
})

// AI analyze lesson preview
lessonsRouter.post(
    '/:id/preview/analyze',
    aiLimiter,
    async (req: Request, res: Response) => {
        try {
            const lessonId = parsePosInt(req.params.id)
            if (lessonId === -1) {
                res.status(400).json({ error: '无效的课程 ID' })
                return
            }

            const lesson = await db
                .select()
                .from(studyLessons)
                .where(eq(studyLessons.id, lessonId))
                .limit(1)
            if (!lesson[0]) {
                res.status(404).json({ error: '课程未找到' })
                return
            }

            const previewRows = await db
                .select()
                .from(studyPreviews)
                .where(eq(studyPreviews.lessonId, lessonId))
                .limit(1)
            const preview = previewRows[0]
            if (!preview) {
                res.status(404).json({ error: '预习内容未保存，请先保存预习' })
                return
            }

            // 已有有效分析则直接复用，避免重复高成本 AI 调用（防止账单刷爆）
            const existingAnalysis = preview.aiAnalysis
                ? safeJsonParse<{ completenessScore?: unknown }>(
                      preview.aiAnalysis,
                      null,
                  )
                : null
            // 复用判定：completenessScore 必须为有限数字（排除 NaN），且结构为纯对象，避免脏数据原样回传
            const scoreOk =
                existingAnalysis &&
                typeof existingAnalysis === 'object' &&
                !Array.isArray(existingAnalysis) &&
                typeof existingAnalysis.completenessScore === 'number' &&
                Number.isFinite(existingAnalysis.completenessScore)
            if (scoreOk) {
                res.json({
                    analysis: existingAnalysis,
                    analyzedAt: preview.aiAnalyzedAt,
                    reused: true,
                })
                return
            }

            const analysisRaw = await analyzePreview(
                lesson[0].subject,
                lesson[0].topic,
                preview.content,
                preview.oldKnowledge,
                preview.questions,
            )

            const analysis = safeJsonParse<Record<string, unknown>>(
                analysisRaw,
                null,
            )
            if (!analysis) {
                res.status(502).json({ error: 'AI 返回内容无法解析' })
                return
            }

            const now = new Date().toISOString()
            // 规范化存储：写入 JSON.stringify(analysis) 而非原始字符串，
            // 避免 AI 返回中可能的 BOM/尾随空白被原样落库造成后续解析脏数据
            await db
                .update(studyPreviews)
                .set({
                    aiAnalysis: JSON.stringify(analysis),
                    aiAnalyzedAt: now,
                    updatedAt: now,
                })
                .where(eq(studyPreviews.id, preview.id))

            res.json({
                analysis,
                analyzedAt: now,
            })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error analyzing lesson preview:', message)
            res.status(500).json({ error: 'AI 分析失败' })
        }
    },
)

// Get the studynote linked to this lesson (1:1)
lessonsRouter.get('/:id/studynote', async (req: Request, res: Response) => {
    try {
        const lessonId = parsePosInt(req.params.id)
        if (lessonId === -1) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const lesson = await db
            .select()
            .from(studyLessons)
            .where(eq(studyLessons.id, lessonId))
            .limit(1)
        if (!lesson[0]) {
            res.status(404).json({ error: '课程未找到' })
            return
        }

        const rows = await db
            .select()
            .from(studyNotes)
            .where(eq(studyNotes.lessonId, lessonId))
            .limit(1)

        res.json({ studynote: rows[0] ?? null })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting lesson studynote:', message)
        res.status(500).json({ error: '获取课程心得失败' })
    }
})
