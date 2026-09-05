import { and, desc, eq, inArray } from 'drizzle-orm'
import { Router } from 'express'
import { studynotesSubjectValues } from '@shared/utils'
import { db } from '../db/index'
import {
    studyLessons,
    studyPreviews,
    studyNotes,
    studyPreviewQuiz,
    studyQuiz,
} from '../db/schema'
import {
    analyzePreview,
    generatePreviewQuestions,
    gradePreviewAnswers,
} from '../services/ai'
import { parsePosInt } from '../utils/param'
import { aiLimiter } from '../utils/rate-limit'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'
import type {
    StudyPreviewQuiz,
    StudyPreviewQuizQuestion,
    StudyPreviewQuizResult,
} from '@shared/types'

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

// 将 study_preview_quiz 行映射为对外 DTO；JSON 字段解析失败时回退安全默认值，避免接口 500
function mapPreviewQuizRow(
    row: typeof studyPreviewQuiz.$inferSelect,
): StudyPreviewQuiz {
    return {
        id: row.id,
        lessonId: row.lessonId,
        questions:
            safeJsonParse<StudyPreviewQuizQuestion[]>(row.questionsJson, []) ?? [],
        answers: row.answersJson
            ? safeJsonParse<string[]>(row.answersJson, [])
            : null,
        results: row.resultsJson
            ? safeJsonParse<StudyPreviewQuizResult[]>(row.resultsJson, [])
            : null,
        score: row.score,
        comment: row.comment,
        suggestions: safeJsonParse<string[]>(row.suggestionsJson, []) ?? [],
        generatedAt: row.generatedAt,
        submittedAt: row.submittedAt,
        evaluatedAt: row.evaluatedAt,
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

        // 聚合课堂问答题状态：每课程最多一套（lessonId 唯一），直接取其 score
        const previewQuizzes = await db
            .select({
                lessonId: studyPreviewQuiz.lessonId,
                score: studyPreviewQuiz.score,
            })
            .from(studyPreviewQuiz)
            .where(inArray(studyPreviewQuiz.lessonId, lessonIds))
        const previewQuizMap = new Map(
            previewQuizzes.map((q) => [q.lessonId, q.score]),
        )

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
                // 是否已生成课堂问答题 + 其评分：决定心得可否开启
                previewQuizGenerated: previewQuizMap.has(lesson.id),
                previewQuizScore: previewQuizMap.get(lesson.id) ?? null,
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
                .delete(studyPreviewQuiz)
                .where(eq(studyPreviewQuiz.lessonId, lessonId))
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
            // 内容变化时，已生成的课堂问答题随之失效（题目基于旧预习内容），须一并删除，
            // 避免学生作答 stale 题目，与作废 aiAnalysis 的意图一致
            if (contentChanged) {
                await db
                    .delete(studyPreviewQuiz)
                    .where(eq(studyPreviewQuiz.lessonId, lessonId))
            }
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

// ===== 课前预习课堂问答题 =====

// 获取已生成的课堂问答题（含作答/评分，无则 null）
lessonsRouter.get('/:id/preview/quiz', async (req: Request, res: Response) => {
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
            .from(studyPreviewQuiz)
            .where(eq(studyPreviewQuiz.lessonId, lessonId))
            .limit(1)
        res.json({ quiz: rows[0] ? mapPreviewQuizRow(rows[0]) : null })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting preview quiz:', message)
        res.status(500).json({ error: '获取课堂问答题失败' })
    }
})

// 生成 3 道课堂问答题（预习完整度达标后手动触发，幂等）
lessonsRouter.post(
    '/:id/preview/quiz',
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
            // 完整度门槛：未达 80 分不允许生成课堂问答题
            const analysis = preview.aiAnalysis
                ? safeJsonParse<{ completenessScore?: unknown }>(
                      preview.aiAnalysis,
                      null,
                  )
                : null
            const raw = analysis?.completenessScore
            const score =
                typeof raw === 'number'
                    ? raw
                    : typeof raw === 'string'
                      ? Number(raw)
                      : NaN
            if (!Number.isFinite(score) || score < 80) {
                res.status(403).json({
                    error: '预习完整度未达 80 分，暂不能生成课堂问答题',
                })
                return
            }
            // 幂等：已生成则直接返回，避免重复高成本 AI 调用
            const existing = await db
                .select()
                .from(studyPreviewQuiz)
                .where(eq(studyPreviewQuiz.lessonId, lessonId))
                .limit(1)
            if (existing[0]) {
                res.json({ quiz: mapPreviewQuizRow(existing[0]) })
                return
            }
            const questions = await generatePreviewQuestions(
                lesson[0].subject,
                lesson[0].topic,
                preview.content,
                preview.oldKnowledge,
                preview.questions,
            )
            const now = new Date().toISOString()
            const inserted = await db
                .insert(studyPreviewQuiz)
                .values({
                    lessonId,
                    questionsJson: JSON.stringify(questions),
                    comment: '',
                    suggestionsJson: '[]',
                    generatedAt: now,
                })
                .returning()
            res.json({ quiz: mapPreviewQuizRow(inserted[0]) })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error generating preview quiz:', message)
            res.status(500).json({ error: '生成课堂问答题失败' })
        }
    },
)

// 提交并 AI 批改课堂问答题
lessonsRouter.post(
    '/:id/preview/quiz/submit',
    aiLimiter,
    async (req: Request, res: Response) => {
        try {
            const lessonId = parsePosInt(req.params.id)
            if (lessonId === -1) {
                res.status(400).json({ error: '无效的课程 ID' })
                return
            }
            const { answers } = req.body
            // 必须为长度 3 的 string[]，任一非字符串即拒绝
            if (
                !Array.isArray(answers) ||
                answers.length !== 3 ||
                !answers.every(
                    (a: unknown): a is string => typeof a === 'string',
                )
            ) {
                res.status(400).json({ error: '需提交 3 道问答题的答案' })
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
                .from(studyPreviewQuiz)
                .where(eq(studyPreviewQuiz.lessonId, lessonId))
                .limit(1)
            if (!rows[0]) {
                res.status(404).json({ error: '尚未生成课堂问答题' })
                return
            }
            // 已批改的记录不允许重复提交
            if (rows[0].resultsJson) {
                res.status(409).json({
                    error: '该课堂问答题已批改，无法重复提交',
                })
                return
            }
            const questions = safeJsonParse<StudyPreviewQuizQuestion[]>(
                rows[0].questionsJson,
                [],
            )
            if (!questions || questions.length !== 3) {
                res.status(409).json({ error: '题目数据异常，无法批改' })
                return
            }
            const preview = await db
                .select()
                .from(studyPreviews)
                .where(eq(studyPreviews.lessonId, lessonId))
                .limit(1)
            const pv = preview[0]
            const grade = await gradePreviewAnswers(
                {
                    subject: lesson[0].subject,
                    topic: lesson[0].topic,
                    content: pv?.content ?? '',
                    oldKnowledge: pv?.oldKnowledge ?? '',
                    questions: pv?.questions ?? '',
                },
                questions,
                answers,
            )
            const now = new Date().toISOString()
            const updated = await db
                .update(studyPreviewQuiz)
                .set({
                    answersJson: JSON.stringify(answers),
                    resultsJson: JSON.stringify(grade.results),
                    score: grade.score,
                    comment: grade.comment,
                    suggestionsJson: JSON.stringify(grade.suggestions),
                    submittedAt: now,
                    evaluatedAt: now,
                })
                .where(eq(studyPreviewQuiz.lessonId, lessonId))
                .returning()
            res.json({ quiz: mapPreviewQuizRow(updated[0]) })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error submitting preview quiz:', message)
            res.status(500).json({ error: '提交课堂问答题失败' })
        }
    },
)
