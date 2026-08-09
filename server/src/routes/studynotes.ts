import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { studynotesSubjectValues } from '@shared/utils'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'
import { db } from '../db/index'
import {
    studynotes,
    studynoteQuiz,
} from '../db/schema'
import {
    evaluateStudynotesReflection,
    generateStudynotesQuiz,
    gradeStudynotesQuiz,
} from '../services/ai'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'

export const studynotesRouter = Router()

/** Validate `:id` param is a positive integer; returns -1 if invalid */
function parseCardId(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}

const QUIZ_ANSWER_MAX_LEN = 5000
const QUIZ_SIZE = 10

function mapQuizRow(row: typeof studynoteQuiz.$inferSelect): StudynotesQuiz {
    return {
        id: row.id,
        studynoteId: row.studynoteId,
        questions: JSON.parse(row.questionsJson) as StudynotesQuizQuestion[],
        answers: row.answersJson ? (JSON.parse(row.answersJson) as string[]) : null,
        results: row.resultsJson
            ? (JSON.parse(row.resultsJson) as StudynotesQuizResult[])
            : null,
        score: row.score,
        correctCount: row.correctCount,
        comment: row.comment,
        suggestions: JSON.parse(row.suggestionsJson) as string[],
        generatedAt: row.generatedAt,
        submittedAt: row.submittedAt,
    }
}

function validateAnswers(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null
    if (raw.length !== QUIZ_SIZE) return null
    return raw.map((item) => {
        if (typeof item !== 'string') return ''
        return item.slice(0, QUIZ_ANSWER_MAX_LEN)
    })
}

const VALID_SUBJECTS = new Set<string>(studynotesSubjectValues)

// List studynotes cards with optional subject filter and search
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
            filters.push(eq(studynotes.subject, subject))
        }

        // Fetch cards
        const cards = await db
            .select()
            .from(studynotes)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(studynotes.createdAt))

        // Fetch quiz counts per card (GROUP BY avoids N+1 with JS counting).
        const countRows = await db
            .select({
                cardId: studynoteQuiz.studynoteId,
                count: sql<number>`COUNT(*)`,
            })
            .from(studynoteQuiz)
            .groupBy(studynoteQuiz.studynoteId)

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
        console.error('Error listing studynotes cards:', message)
        res.status(500).json({ error: '获取学习心得列表失败' })
    }
})

// Get single studynotes card
studynotesRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting studynotes card:', message)
        res.status(500).json({ error: '获取学习心得失败' })
    }
})

// Create studynotes card
studynotesRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { subject, topic, summary, example, stuckPoints, memoryHook } =
            req.body

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

        const rows = await db
            .insert(studynotes)
            .values({
                subject,
                topic: typeof topic === 'string' ? topic : '',
                summary,
                example,
                stuckPoints,
                memoryHook: typeof memoryHook === 'string' ? memoryHook : null,
            })
            .returning()

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error creating studynotes card:', message)
        res.status(500).json({ error: '创建学习心得失败' })
    }
})

// Update studynotes card
studynotesRouter.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
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
            .update(studynotes)
            .set({
                ...(subject !== undefined && { subject }),
                ...(topic !== undefined && { topic }),
                ...(summary !== undefined && { summary }),
                ...(example !== undefined && { example }),
                ...(stuckPoints !== undefined && { stuckPoints }),
                ...(memoryHook !== undefined && { memoryHook }),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(studynotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error updating studynotes card:', message)
        res.status(500).json({ error: '更新学习心得失败' })
    }
})

// Delete studynotes card
studynotesRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .delete(studynotes)
            .where(eq(studynotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting studynotes card:', message)
        res.status(500).json({ error: '删除学习心得失败' })
    }
})

// AI evaluate studynotes card
studynotesRouter.post('/:id/evaluate', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        const evaluationRaw = await evaluateStudynotesReflection(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
        )

        const evaluation = JSON.parse(evaluationRaw)

        const now = new Date().toISOString()
        await db
            .update(studynotes)
            .set({
                evaluation: evaluationRaw,
                evaluatedAt: now,
                updatedAt: now,
            })
            .where(eq(studynotes.id, id))

        res.json({
            evaluation,
            evaluatedAt: now,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error evaluating studynotes card:', message)
        res.status(500).json({ error: 'AI 评估失败' })
    }
})

// 生成专属测验：校验评估 ≥80 后，出 10 题并入库（submittedAt 为 null）
studynotesRouter.post('/:id/quiz', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        const evaluation = card.evaluation ? JSON.parse(card.evaluation) : null
        const completenessScore = evaluation?.completenessScore
        if (
            typeof completenessScore !== 'number' ||
            completenessScore < 80
        ) {
            res.status(403).json({
                error: 'AI 评估未达 80 分，暂不能开始测验',
            })
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

        const now = new Date().toISOString()
        const inserted = await db
            .insert(studynoteQuiz)
            .values({
                studynoteId: id,
                questionsJson: JSON.stringify(questions),
                generatedAt: now,
            })
            .returning()

        res.json({ quiz: mapQuizRow(inserted[0]) })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error generating studynotes quiz:', message)
        res.status(500).json({ error: message || '生成测验失败' })
    }
})

// 自动保存答题内容：仅更新 answersJson，不批改
studynotesRouter.patch(
    '/:id/quiz/:quizId/answers',
    async (req: Request, res: Response) => {
        try {
            const id = parseCardId(req.params.id)
            const quizId = Number(req.params.quizId)
            if (id === -1 || !Number.isInteger(quizId) || quizId <= 0) {
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
                .from(studynoteQuiz)
                .where(
                    and(
                        eq(studynoteQuiz.id, quizId),
                        eq(studynoteQuiz.studynoteId, id),
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
                .update(studynoteQuiz)
                .set({
                    answersJson: JSON.stringify(answers),
                    updatedAt: new Date().toISOString(),
                })
                .where(eq(studynoteQuiz.id, quizId))

            res.json({ success: true })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
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
            const id = parseCardId(req.params.id)
            const quizId = Number(req.params.quizId)
            if (id === -1 || !Number.isInteger(quizId) || quizId <= 0) {
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
                .from(studynoteQuiz)
                .where(
                    and(
                        eq(studynoteQuiz.id, quizId),
                        eq(studynoteQuiz.studynoteId, id),
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
                .from(studynotes)
                .where(eq(studynotes.id, id))
                .limit(1)
            if (!card[0]) {
                res.status(404).json({ error: '学习心得未找到' })
                return
            }

            const questions = JSON.parse(
                existing[0].questionsJson,
            ) as StudynotesQuizQuestion[]

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
                .update(studynoteQuiz)
                .set({
                    answersJson: JSON.stringify(answers),
                    resultsJson: JSON.stringify(grade.results),
                    score: grade.score,
                    correctCount: grade.correctCount,
                    comment: grade.comment,
                    suggestionsJson: JSON.stringify(grade.suggestions),
                    submittedAt: now,
                    updatedAt: now,
                })
                .where(eq(studynoteQuiz.id, quizId))

            // 回写最新分数快照到卡片
            await db
                .update(studynotes)
                .set({
                    quizScore: grade.score,
                    updatedAt: now,
                })
                .where(eq(studynotes.id, id))

            const updated = await db
                .select()
                .from(studynoteQuiz)
                .where(eq(studynoteQuiz.id, quizId))
                .limit(1)

            res.json({ quiz: mapQuizRow(updated[0]) })
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
            console.error('Error submitting studynotes quiz:', message)
            res.status(500).json({ error: message || '提交测验失败' })
        }
    },
)

// 获取该卡片最新一条测验记录（恢复现场）
studynotesRouter.get('/:id/quiz/latest', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynoteQuiz)
            .where(eq(studynoteQuiz.studynoteId, id))
            .orderBy(desc(studynoteQuiz.id))
            .limit(1)

        if (!rows[0]) {
            res.json({ quiz: null })
            return
        }

        res.json({ quiz: mapQuizRow(rows[0]) })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting latest quiz:', message)
        res.status(500).json({ error: '获取测验记录失败' })
    }
})
