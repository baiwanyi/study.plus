import { Router } from 'express'
import type { Request, Response } from 'express'
import { parsePosInt } from '../utils/param'
import { aiLimiter } from '../utils/rate-limit'
import {
    createStudyNote,
    deleteStudyNote,
    evaluateStudyNote,
    generateQuiz,
    getLatestQuiz,
    getStudyNote,
    gradeQuiz,
    listStudyNotes,
    saveQuizAnswers,
    submitQuiz,
    updateStudyNote,
    validateAnswers,
} from '../services/studynotes'

export const studynotesRouter = Router()

// List studyNotes cards with optional subject filter and search
studynotesRouter.get('/', async (req: Request, res: Response) => {
    try {
        const { subject, search } = req.query
        const result = await listStudyNotes({
            subject: typeof subject === 'string' ? subject : undefined,
            search: typeof search === 'string' ? search : undefined,
        })
        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error listing studyNotes cards:', message)
        res.status(500).json({ error: '获取学习管理列表失败' })
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

        const note = await getStudyNote(id)
        if (!note) {
            res.status(404).json({ error: '学习管理未找到' })
            return
        }

        res.json(note)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting studyNotes card:', message)
        res.status(500).json({ error: '获取学习管理失败' })
    }
})

// Create studyNotes card
studynotesRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { summary, example, stuckPoints, memoryHook, lessonId } =
            req.body

        // Validate required fields: must be non-empty strings (reject arrays/objects)
        if (
            typeof summary !== 'string' ||
            typeof example !== 'string' ||
            typeof stuckPoints !== 'string' ||
            !summary.trim() ||
            !example.trim()
        ) {
            res.status(400).json({ error: '概括、例子为必填项' })
            return
        }

        const note = await createStudyNote({
            summary,
            example,
            stuckPoints,
            memoryHook,
            lessonId,
        })

        res.json(note)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error creating studyNotes card:', message)
        res.status(500).json({ error: '创建学习管理失败' })
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

        const { summary, example, stuckPoints, memoryHook, lessonId } =
            req.body

        // Validate at least one content field is provided
        if (
            summary === undefined &&
            example === undefined &&
            stuckPoints === undefined &&
            memoryHook === undefined &&
            lessonId === undefined
        ) {
            res.status(400).json({ error: '请提供至少一个要更新的字段' })
            return
        }

        if (
            (summary !== undefined && typeof summary !== 'string') ||
            (example !== undefined && typeof example !== 'string') ||
            (stuckPoints !== undefined && typeof stuckPoints !== 'string') ||
            (memoryHook !== undefined &&
                typeof memoryHook !== 'string' &&
                memoryHook !== null) ||
            (lessonId !== undefined &&
                (typeof lessonId !== 'number' || !Number.isInteger(lessonId)))
        ) {
            res.status(400).json({ error: '字段类型错误' })
            return
        }

        const note = await updateStudyNote(id, {
            summary,
            example,
            stuckPoints,
            memoryHook,
            lessonId,
        })
        if (!note) {
            res.status(404).json({ error: '学习管理未找到' })
            return
        }

        res.json(note)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error updating studyNotes card:', message)
        res.status(500).json({ error: '更新学习管理失败' })
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

        const ok = await deleteStudyNote(id)
        if (!ok) {
            res.status(404).json({ error: '学习管理未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting studyNotes card:', message)
        res.status(500).json({ error: '删除学习管理失败' })
    }
})

// AI evaluate studyNotes card
studynotesRouter.post(
    '/:id/evaluate',
    aiLimiter,
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            if (id === -1) {
                res.status(400).json({ error: '无效的卡片 ID' })
                return
            }

            const result = await evaluateStudyNote(id)
            if (!result) {
                res.status(404).json({ error: '学习管理未找到' })
                return
            }

            res.json({
                evaluation: result.evaluation,
                evaluatedAt: result.evaluatedAt,
                reused: result.reused,
            })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error evaluating studyNotes card:', message)
            res.status(500).json({ error: 'AI 评估失败' })
        }
    },
)

// 生成专属测验：校验评估 ≥80 后，出 10 题并入库（submittedAt 为 null）
studynotesRouter.post(
    '/:id/quiz',
    aiLimiter,
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            if (id === -1) {
                res.status(400).json({ error: '无效的卡片 ID' })
                return
            }

            const result = await generateQuiz(id)
            if (!result) {
                res.status(404).json({ error: '学习管理未找到' })
                return
            }

            res.json({ quiz: result.quiz })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error generating studyNotes quiz:', message)
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
            if (message.includes('AI 评估未达 80')) {
                res.status(403).json({ error: message })
                return
            }
            res.status(500).json({ error: '生成测验失败' })
        }
    },
)

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
                    error: `答案必须为长度 10 的数组`,
                })
                return
            }

            const result = await saveQuizAnswers(id, quizId, answers)
            if (!result) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }

            res.json({ success: true })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error saving quiz answers:', message)
            if (message.includes('该测验已提交')) {
                res.status(409).json({ error: message })
                return
            }
            res.status(500).json({ error: '保存答题内容失败' })
        }
    },
)

// 提交并批改测验
studynotesRouter.post(
    '/:id/quiz/:quizId/submit',
    aiLimiter,
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
                    error: `答案必须为长度 10 的数组`,
                })
                return
            }

            const result = await submitQuiz(id, quizId, answers)
            if (!result) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }

            res.json({ quiz: result.quiz })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error submitting studyNotes quiz:', message)
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
            if (message.includes('该测验已提交')) {
                res.status(409).json({ error: message })
                return
            }
            res.status(500).json({ error: '提交测验失败' })
        }
    },
)

// 按当前模式批改旧记录：用库内已有题目+答案直接 AI 批改，写回结果/分数（不重新作答）
studynotesRouter.post(
    '/:id/quiz/:quizId/grade',
    aiLimiter,
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            // 批改前允许微调答案：body 携带最新 answers 时以其为准（并回写），否则用库内提交快照
            const latestAnswers = validateAnswers(req.body?.answers)
            const result = await gradeQuiz(
                id,
                quizId,
                latestAnswers ?? undefined,
            )
            if (!result) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }

            res.json({ quiz: result.quiz })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error grading old studyNotes quiz:', message)
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志
            if (message.includes('不可批改')) {
                res.status(409).json({ error: message })
                return
            }
            if (message.includes('无题目') || message.includes('无答题内容')) {
                res.status(400).json({ error: message })
                return
            }
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

            const result = await getLatestQuiz(id)
            res.json({ quiz: result.quiz })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error getting latest quiz:', message)
            res.status(500).json({ error: '获取测验记录失败' })
        }
    },
)
