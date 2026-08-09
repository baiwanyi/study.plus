import { and, desc, eq, sql } from 'drizzle-orm'
import rateLimit from 'express-rate-limit'
import { Router } from 'express'
import { studynotesSubjectValues } from '@shared/utils'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'
import { db } from '../db/index'
import { studyNotes, studyQuiz } from '../db/schema'
import {
    evaluateStudynotesReflection,
    generateStudynotesQuiz,
    gradeStudynotesQuiz,
} from '../services/ai'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'

export const studynotesRouter = Router()

// Stricter limit for AI evaluation endpoint (protect against billing burn)
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        res.status(429).json({ error: 'AI 调用过于频繁，请稍后再试' })
    },
})

/** Validate param is a positive integer; returns -1 if invalid */
function parsePosInt(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}

const QUIZ_ANSWER_MAX_LEN = 5000
const QUIZ_SIZE = 10

// 入库前清洗：剔除 index>10 越界题与空题干，重排 index 为连续 1..N，杜绝脏数据入库
function sanitizeQuizQuestions(
    questions: StudynotesQuizQuestion[],
): StudynotesQuizQuestion[] {
    const kept = questions.filter((q) => {
        if (!Number.isInteger(q.index) || q.index > QUIZ_SIZE) return false
        const text = q.question.trim()
        if (!text) return false
        return true
    })
    return kept.map((q, i) => ({ ...q, index: i + 1 }))
}

// JSON 字段可能损坏（迁移异常/手工改库），解析失败时回退安全默认值，避免整个接口 500
function safeJsonParse<T>(raw: string | null, fallback: T): T
function safeJsonParse<T>(raw: string | null, fallback: null): T | null
function safeJsonParse<T>(raw: string | null, fallback: T | null): T | null {
    if (raw === null || raw === undefined) return fallback as T | null
    try {
        return JSON.parse(raw) as T
    } catch (error) {
        console.warn(
            '测验记录 JSON 字段解析失败，已回退默认值:',
            (error as Error).message,
        )
        return fallback as T | null
    }
}

function mapQuizRow(row: typeof studyQuiz.$inferSelect): StudynotesQuiz {
    return {
        id: row.id,
        studynoteId: row.studynoteId,
        questions: safeJsonParse<StudynotesQuizQuestion[]>(
            row.questionsJson,
            [],
        ),
        answers: row.answersJson
            ? safeJsonParse<string[]>(row.answersJson, [])
            : null,
        results: row.resultsJson
            ? safeJsonParse<StudynotesQuizResult[]>(row.resultsJson, [])
            : null,
        score: row.score,
        correctCount: row.correctCount,
        comment: row.comment,
        suggestions: safeJsonParse<string[]>(row.suggestionsJson, []),
        generatedAt: row.generatedAt,
        submittedAt: row.submittedAt,
    }
}

function validateAnswers(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null
    if (raw.length !== QUIZ_SIZE) return null
    // 任一元素非字符串即视为非法，拒绝而非静默转空串，避免答案错位污染批改
    if (!raw.every((item) => typeof item === 'string')) return null
    return raw.map((item) => (item as string).slice(0, QUIZ_ANSWER_MAX_LEN))
}

const VALID_SUBJECTS = new Set<string>(studynotesSubjectValues)

// List studyNotes cards with optional subject filter and search
studynotesRouter.get('/', async (req: Request, res: Response) => {
    try {
        const { subject, search } = req.query

        // Build filter conditions dynamically to avoid Drizzle type issue
        const filters: SQL[] = []
        if (
            subject &&
            typeof subject === 'string' &&
            VALID_SUBJECTS.has(subject)
        ) {
            filters.push(eq(studyNotes.subject, subject))
        }

        // Fetch cards
        const cards = await db
            .select()
            .from(studyNotes)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(studyNotes.createdAt))

        // Fetch quiz counts per card (GROUP BY avoids N+1 with JS counting).
        const countRows = await db
            .select({
                cardId: studyQuiz.studynoteId,
                count: sql<number>`COUNT(*)`,
            })
            .from(studyQuiz)
            .groupBy(studyQuiz.studynoteId)

        const countMap = new Map(countRows.map((r) => [r.cardId, r.count]))

        const result = cards.map((card) => ({
            ...card,
            quizCount: countMap.get(card.id) ?? 0,
        }))

        // Apply search filter in-memory for simplicity
        if (search && typeof search === 'string') {
            const keyword = search.toLowerCase()
            return res.json(
                result.filter(
                    (r) =>
                        r.topic.toLowerCase().includes(keyword) ||
                        r.summary.toLowerCase().includes(keyword) ||
                        r.example.toLowerCase().includes(keyword) ||
                        r.stuckPoints.toLowerCase().includes(keyword),
                ),
            )
        }

        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error listing studyNotes cards:', message)
        res.status(500).json({ error: '获取学习心得列表失败' })
    }
})

// Get single studyNotes card
studynotesRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studyNotes)
            .where(eq(studyNotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting studyNotes card:', message)
        res.status(500).json({ error: '获取学习心得失败' })
    }
})

// Create studyNotes card
studynotesRouter.post('/', async (req: Request, res: Response) => {
    try {
        const {
            subject,
            topic,
            summary,
            example,
            stuckPoints,
            memoryHook,
            lessonId,
        } = req.body

        // Validate required fields: must be non-empty strings (reject arrays/objects)
        if (
            typeof subject !== 'string' ||
            typeof summary !== 'string' ||
            typeof example !== 'string' ||
            typeof stuckPoints !== 'string' ||
            !subject.trim() ||
            !summary.trim() ||
            !example.trim()
        ) {
            res.status(400).json({ error: '学科、概括、例子为必填项' })
            return
        }

        if (!VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const normalizedLessonId =
            lessonId == null || lessonId === '' ? null : Number(lessonId)
        if (
            normalizedLessonId !== null &&
            (!Number.isInteger(normalizedLessonId) || normalizedLessonId <= 0)
        ) {
            res.status(400).json({ error: '无效的课程 ID' })
            return
        }

        const rows = await db
            .insert(studyNotes)
            .values({
                subject,
                topic: typeof topic === 'string' ? topic : '',
                summary,
                example,
                stuckPoints,
                memoryHook: typeof memoryHook === 'string' ? memoryHook : null,
                lessonId: normalizedLessonId,
            })
            .returning()

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error creating studyNotes card:', message)
        res.status(500).json({ error: '创建学习心得失败' })
    }
})

// Update studyNotes card
studynotesRouter.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const { subject, topic, summary, example, stuckPoints, memoryHook } =
            req.body

        // Validate at least one content field is provided
        if (
            subject === undefined &&
            topic === undefined &&
            summary === undefined &&
            example === undefined &&
            stuckPoints === undefined &&
            memoryHook === undefined
        ) {
            res.status(400).json({ error: '请提供至少一个要更新的字段' })
            return
        }

        if (
            (subject !== undefined && typeof subject !== 'string') ||
            (summary !== undefined && typeof summary !== 'string') ||
            (example !== undefined && typeof example !== 'string') ||
            (stuckPoints !== undefined && typeof stuckPoints !== 'string') ||
            (topic !== undefined && typeof topic !== 'string') ||
            (memoryHook !== undefined &&
                typeof memoryHook !== 'string' &&
                memoryHook !== null)
        ) {
            res.status(400).json({ error: '字段类型错误' })
            return
        }

        if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const rows = await db
            .update(studyNotes)
            .set({
                ...(subject !== undefined && { subject }),
                ...(topic !== undefined && { topic }),
                ...(summary !== undefined && { summary }),
                ...(example !== undefined && { example }),
                ...(stuckPoints !== undefined && { stuckPoints }),
                ...(memoryHook !== undefined && { memoryHook }),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(studyNotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error updating studyNotes card:', message)
        res.status(500).json({ error: '更新学习心得失败' })
    }
})

// Delete studyNotes card
studynotesRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .delete(studyNotes)
            .where(eq(studyNotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting studyNotes card:', message)
        res.status(500).json({ error: '删除学习心得失败' })
    }
})

// AI evaluate studyNotes card
studynotesRouter.post('/:id/evaluate', aiLimiter, async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studyNotes)
            .where(eq(studyNotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        // 已有有效评估则直接复用，避免重复高成本 AI 调用（防止账单刷爆）
        const existingEval = card.evaluation
            ? safeJsonParse<Record<string, unknown>>(card.evaluation, null)
            : null
        if (
            existingEval &&
            typeof existingEval.completenessScore === 'number'
        ) {
            res.json({
                evaluation: existingEval,
                evaluatedAt: card.evaluatedAt,
                reused: true,
            })
            return
        }

        const evaluationRaw = await evaluateStudynotesReflection(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
        )

        const evaluation = safeJsonParse<Record<string, unknown>>(
            evaluationRaw,
            null,
        )
        if (!evaluation) {
            res.status(502).json({ error: 'AI 返回内容无法解析' })
            return
        }

        const now = new Date().toISOString()
        await db
            .update(studyNotes)
            .set({
                evaluation: evaluationRaw,
                evaluatedAt: now,
                updatedAt: now,
            })
            .where(eq(studyNotes.id, id))

        res.json({
            evaluation,
            evaluatedAt: now,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error evaluating studyNotes card:', message)
        res.status(500).json({ error: 'AI 评估失败' })
    }
})

// 生成专属测验：校验评估 ≥80 后，出 10 题并入库（submittedAt 为 null）
studynotesRouter.post('/:id/quiz', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studyNotes)
            .where(eq(studyNotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        const evaluation = card.evaluation
            ? safeJsonParse<Record<string, unknown>>(card.evaluation, null)
            : null
        const completenessScore = evaluation?.completenessScore
        if (typeof completenessScore !== 'number' || completenessScore < 80) {
            res.status(403).json({
                error: 'AI 评估未达 80 分，暂不能开始测验',
            })
            return
        }

        // 幂等：复用已存在但未提交的测验，避免重复生成与孤儿记录
        const pending = await db
            .select()
            .from(studyQuiz)
            .where(
                and(
                    eq(studyQuiz.studynoteId, id),
                    sql`${studyQuiz.submittedAt} IS NULL`,
                ),
            )
            .limit(1)

        if (pending[0]) {
            res.json({ quiz: mapQuizRow(pending[0]) })
            return
        }

        const questions = await generateStudynotesQuiz({
            subject: card.subject,
            topic: card.topic,
            summary: card.summary,
            example: card.example,
            stuckPoints: card.stuckPoints,
            memoryHook: card.memoryHook,
        })

        // 入库前清洗：剔除越界题与空题干，重排 index 为连续 1..N
        const sanitized = sanitizeQuizQuestions(questions)

        const now = new Date().toISOString()
        let quizRow: typeof studyQuiz.$inferSelect | undefined

        // 并发竞态下 insert 可能因唯一约束冲突抛异常，捕获后回退复用已有未提交记录
        try {
            quizRow = (
                await db
                    .insert(studyQuiz)
                    .values({
                        studynoteId: id,
                        questionsJson: JSON.stringify(sanitized),
                        generatedAt: now,
                    })
                    .returning()
            )[0]
        } catch (insertError: unknown) {
            const message =
                insertError instanceof Error
                    ? insertError.message
                    : String(insertError)
            console.warn('并发生成测验冲突，回退复用已有记录:', message)
            // 回退取该卡片最新一条记录（不限已提交），与幂等查询行为一致，
            // 避免并发时序极端情况下（首条已被提交）回退查询落空导致 500
            const fallback = await db
                .select()
                .from(studyQuiz)
                .where(eq(studyQuiz.studynoteId, id))
                .orderBy(desc(studyQuiz.id))
                .limit(1)
            quizRow = fallback[0]
        }

        if (!quizRow) {
            res.status(500).json({ error: '生成测验失败' })
            return
        }

        res.json({ quiz: mapQuizRow(quizRow) })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error generating studyNotes quiz:', message)
        // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
        res.status(500).json({ error: '生成测验失败' })
    }
})

// 自动保存答题内容：仅更新 answersJson，不批改
studynotesRouter.patch(
    '/:id/quiz/:quizId/answers',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            const answers = validateAnswers(req.body?.answers)
            if (!answers) {
                res.status(400).json({
                    error: `答案必须为长度 ${QUIZ_SIZE} 的数组`,
                })
                return
            }

            const existing = await db
                .select()
                .from(studyQuiz)
                .where(
                    and(
                        eq(studyQuiz.id, quizId),
                        eq(studyQuiz.studynoteId, id),
                    ),
                )
                .limit(1)

            if (!existing[0]) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }
            if (existing[0].submittedAt) {
                res.status(409).json({ error: '该测验已提交，无法修改' })
                return
            }

            await db
                .update(studyQuiz)
                .set({
                    answersJson: JSON.stringify(answers),
                })
                .where(eq(studyQuiz.id, quizId))

            res.json({ success: true })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error saving quiz answers:', message)
            res.status(500).json({ error: '保存答题内容失败' })
        }
    },
)

// 提交并批改测验
studynotesRouter.post(
    '/:id/quiz/:quizId/submit',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            const answers = validateAnswers(req.body?.answers)
            if (!answers) {
                res.status(400).json({
                    error: `答案必须为长度 ${QUIZ_SIZE} 的数组`,
                })
                return
            }

            const existing = await db
                .select()
                .from(studyQuiz)
                .where(
                    and(
                        eq(studyQuiz.id, quizId),
                        eq(studyQuiz.studynoteId, id),
                    ),
                )
                .limit(1)

            if (!existing[0]) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }
            if (existing[0].submittedAt) {
                res.status(409).json({ error: '该测验已提交' })
                return
            }

            const card = await db
                .select()
                .from(studyNotes)
                .where(eq(studyNotes.id, id))
                .limit(1)
            if (!card[0]) {
                res.status(404).json({ error: '学习心得未找到' })
                return
            }

            const questions = safeJsonParse<StudynotesQuizQuestion[]>(
                existing[0].questionsJson,
                [],
            )

            const grade = await gradeStudynotesQuiz(
                {
                    subject: card[0].subject,
                    topic: card[0].topic,
                    summary: card[0].summary,
                    example: card[0].example,
                    stuckPoints: card[0].stuckPoints,
                    memoryHook: card[0].memoryHook,
                },
                questions,
                answers,
            )

            const now = new Date().toISOString()
            await db
                .update(studyQuiz)
                .set({
                    answersJson: JSON.stringify(answers),
                    resultsJson: JSON.stringify(grade.results),
                    score: grade.score,
                    correctCount: grade.correctCount,
                    comment: grade.comment,
                    suggestionsJson: JSON.stringify(grade.suggestions),
                    submittedAt: now,
                })
                .where(eq(studyQuiz.id, quizId))

            // 回写最新分数快照到卡片
            await db
                .update(studyNotes)
                .set({
                    quizScore: grade.score,
                    updatedAt: now,
                })
                .where(eq(studyNotes.id, id))

            const updated = await db
                .select()
                .from(studyQuiz)
                .where(eq(studyQuiz.id, quizId))
                .limit(1)

            res.json({ quiz: mapQuizRow(updated[0]) })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error submitting studyNotes quiz:', message)
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
            res.status(500).json({ error: '提交测验失败' })
        }
    },
)

// 按当前模式批改旧记录：用库内已有题目+答案直接 AI 批改，写回结果/分数（不重新作答）
studynotesRouter.post(
    '/:id/quiz/:quizId/grade',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            const existing = await db
                .select()
                .from(studyQuiz)
                .where(
                    and(
                        eq(studyQuiz.id, quizId),
                        eq(studyQuiz.studynoteId, id),
                    ),
                )
                .limit(1)

            if (!existing[0]) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }
            // 仅允许「已提交但未批改」的旧记录执行补批改；已批改的记录不允许重复
            if (!existing[0].submittedAt || existing[0].resultsJson) {
                res.status(409).json({ error: '该记录当前状态不可批改' })
                return
            }

            const questions = safeJsonParse<StudynotesQuizQuestion[]>(
                existing[0].questionsJson,
                [],
            )
            const answers = existing[0].answersJson
                ? safeJsonParse<string[]>(existing[0].answersJson, [])
                : []
            if (questions.length === 0) {
                res.status(400).json({ error: '该记录无题目，无法批改' })
                return
            }
            // 库内答案损坏为空数组时，批改会下标错位，直接拒绝而非静默批改
            if (answers.length === 0) {
                res.status(400).json({ error: '该记录无答题内容，无法批改' })
                return
            }

            const card = await db
                .select()
                .from(studyNotes)
                .where(eq(studyNotes.id, id))
                .limit(1)
            if (!card[0]) {
                res.status(404).json({ error: '学习心得未找到' })
                return
            }

            const grade = await gradeStudynotesQuiz(
                {
                    subject: card[0].subject,
                    topic: card[0].topic,
                    summary: card[0].summary,
                    example: card[0].example,
                    stuckPoints: card[0].stuckPoints,
                    memoryHook: card[0].memoryHook,
                },
                questions,
                answers,
            )

            const now = new Date().toISOString()
            await db
                .update(studyQuiz)
                .set({
                    resultsJson: JSON.stringify(grade.results),
                    score: grade.score,
                    correctCount: grade.correctCount,
                    comment: grade.comment,
                    suggestionsJson: JSON.stringify(grade.suggestions),
                })
                .where(eq(studyQuiz.id, quizId))

            // 回写最新分数快照到卡片
            await db
                .update(studyNotes)
                .set({
                    quizScore: grade.score,
                    updatedAt: now,
                })
                .where(eq(studyNotes.id, id))

            const updated = await db
                .select()
                .from(studyQuiz)
                .where(eq(studyQuiz.id, quizId))
                .limit(1)

            res.json({ quiz: mapQuizRow(updated[0]) })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error grading old studyNotes quiz:', message)
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
            res.status(500).json({ error: '批改测验失败' })
        }
    },
)

// 获取该卡片最新一条测验记录（恢复现场）
studynotesRouter.get(
    '/:id/quiz/latest',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            if (id === -1) {
                res.status(400).json({ error: '无效的卡片 ID' })
                return
            }

            const rows = await db
                .select()
                .from(studyQuiz)
                .where(eq(studyQuiz.studynoteId, id))
                .orderBy(desc(studyQuiz.id))
                .limit(1)

            if (!rows[0]) {
                res.json({ quiz: null })
                return
            }

            res.json({ quiz: mapQuizRow(rows[0]) })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error getting latest quiz:', message)
            res.status(500).json({ error: '获取测验记录失败' })
        }
    },
)
