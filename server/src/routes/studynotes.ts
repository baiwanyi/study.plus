/**
 * 学习管理（Studynotes）路由模块：暴露 /study 前缀下的心得 CRUD、AI 评估、
 * 测验生成/提交/批改、历史测验与错题本（单课程/全局）等 RESTful 端点。
 * 复用约定：入参统一经 parsePosInt 校验（非法返回 400）；业务逻辑全部下沉 services 层；
 * AI 类端点挂 aiLimiter 限流防刷。
 * 关键约束：错误响应不暴露内部细节（可能含 SQL/表名）；带路径参数的测验详情路由
 * 必须注册在 /history、/wrong 等字面量子路径之后，避免被动态段吞掉。
 */
import { Router } from 'express'
import { STUDY_QUIZ_TIME_LIMIT_SECONDS } from '@shared/constants'
import { parsePosInt } from '../utils/param'
import { aiLimiter } from '../utils/rate-limit'
import {
    createStudyNote,
    deleteStudyNote,
    evaluateStudyNote,
    generateQuiz,
    getLatestQuiz,
    getQuizDetail,
    getQuizHistory,
    getStudyNote,
    getWrongQuestions,
    getWrongQuestionsAll,
    gradeQuiz,
    listStudyNotes,
    saveQuizAnswers,
    saveQuizRemainingSeconds,
    submitQuiz,
    updateStudyNote,
    validateAnswers,
} from '../services/studynotes'
import type { Request, Response } from 'express'

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
        const { summary, example, stuckPoints, memoryHook, lessonId } = req.body

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

        // lessonId 为创建必填项：缺失/非法属于客户端错误应 400（service 层也会拒绝，但不应落到 500）
        if (
            typeof lessonId !== 'number' ||
            !Number.isInteger(lessonId) ||
            lessonId <= 0
        ) {
            res.status(400).json({ error: '必须关联有效的 lessonId' })
            return
        }
        // memoryHook 为可选字段，但类型必须正确（与 PUT 校验保持一致）
        if (
            memoryHook !== undefined &&
            memoryHook !== null &&
            typeof memoryHook !== 'string'
        ) {
            res.status(400).json({ error: '字段类型错误' })
            return
        }

        const note = await createStudyNote({
            summary,
            example,
            stuckPoints,
            memoryHook,
            lessonId,
        })

        // RESTful 创建语义：新建资源返回 201 Created
        res.status(201).json(note)
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

        const { summary, example, stuckPoints, memoryHook, lessonId } = req.body

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
            (summary !== undefined &&
                (typeof summary !== 'string' || !summary.trim())) ||
            (example !== undefined &&
                (typeof example !== 'string' || !example.trim())) ||
            (stuckPoints !== undefined && typeof stuckPoints !== 'string') ||
            (memoryHook !== undefined &&
                typeof memoryHook !== 'string' &&
                memoryHook !== null) ||
            (lessonId !== undefined &&
                (typeof lessonId !== 'number' ||
                    !Number.isInteger(lessonId) ||
                    // 与 POST 校验一致：非正整数在本层 400 拦截，
                    // 避免穿透 service 后因 lesson 不存在抛错变 500
                    lessonId <= 0))
        ) {
            res.status(400).json({ error: '字段类型错误或不能为空' })
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

// 生成专属测验：校验评估 ≥80 后，出 20 题并入库（submittedAt 为 null）
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
                    error: `答案必须为长度 20 的数组`,
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
            // 匹配文本须与 service 抛出的锁定错误一致（'该测验已批改，无法修改答案'）
            if (message.includes('该测验已批改')) {
                res.status(409).json({ error: message })
                return
            }
            res.status(500).json({ error: '保存答题内容失败' })
        }
    },
)

// 保存测验剩余秒数快照：弹窗关闭时冻结倒计时，二次打开续算（无 AI 限流需求）
studynotesRouter.patch(
    '/:id/quiz/:quizId/remaining-seconds',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            const remainingSeconds = req.body?.remainingSeconds
            if (
                typeof remainingSeconds !== 'number' ||
                !Number.isInteger(remainingSeconds) ||
                remainingSeconds < 0 ||
                remainingSeconds > STUDY_QUIZ_TIME_LIMIT_SECONDS
            ) {
                res.status(400).json({
                    error: `剩余秒数必须为 0~${STUDY_QUIZ_TIME_LIMIT_SECONDS} 的整数`,
                })
                return
            }

            const result = await saveQuizRemainingSeconds(
                id,
                quizId,
                remainingSeconds,
            )
            if (!result) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }

            res.json({ success: true })
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error saving quiz remaining seconds:', message)
            // 匹配文本须与 service 抛出的锁定错误一致（'该测验已提交，无法保存剩余时间'）
            if (message.includes('该测验已提交')) {
                res.status(409).json({ error: message })
                return
            }
            res.status(500).json({ error: '保存剩余时间失败' })
        }
    },
)

// 提交测验：仅保存答案并标记已提交，不调 AI（批改由 grade 路由完成），故无需 AI 限流
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
                    error: `答案必须为长度 20 的数组`,
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
            // 不向客户端暴露内部错误详情（可能含 SQL/表名），原始信息仅记日志；
            // 匹配文本须与 service 抛出的锁定错误一致（'该测验已批改，无法修改答案'）
            if (message.includes('该测验已批改')) {
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

            // 批改前允许微调答案：body 携带最新 answers 时以其为准（并回写），否则用库内提交快照；
            // 区分「未携带」与「携带但非法」——后者应 400，避免静默改用库内快照造成用户困惑
            const hasLatestAnswers = req.body?.answers !== undefined
            const latestAnswers = hasLatestAnswers
                ? validateAnswers(req.body.answers)
                : undefined
            if (hasLatestAnswers && !latestAnswers) {
                res.status(400).json({ error: '答案必须为长度 20 的数组' })
                return
            }
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

// 全局错题本：跨课程聚合全部已批改测验的错题，支持分页/搜索/按科目筛选。
// 注意必须注册在 /:id/quiz/:quizId 之前，避免字面量 quiz 被动态 :id 吞掉
studynotesRouter.get('/quiz/wrong-all', async (req: Request, res: Response) => {
    try {
        const page = parsePosInt(req.query.page)
        const pageSize = parsePosInt(req.query.pageSize)
        const subject =
            typeof req.query.subject === 'string' && req.query.subject.trim()
                ? req.query.subject.trim()
                : undefined
        const search =
            typeof req.query.search === 'string'
                ? req.query.search.trim()
                : undefined
        const result = await getWrongQuestionsAll({
            page: page === -1 ? 1 : page,
            pageSize: pageSize === -1 ? 20 : Math.min(pageSize, 100),
            ...(subject ? { subject } : {}),
            ...(search ? { search } : {}),
        })
        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting wrong questions (all):', message)
        res.status(500).json({ error: '获取错题本失败' })
    }
})

// 该课程历史测验列表（仅已提交），按提交先后倒序
studynotesRouter.get(
    '/:id/quiz/history',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            if (id === -1) {
                res.status(400).json({ error: '无效的卡片 ID' })
                return
            }

            const result = await getQuizHistory(id)
            if (!result) {
                res.status(404).json({ error: '学习管理未找到' })
                return
            }

            res.json(result)
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error getting quiz history:', message)
            res.status(500).json({ error: '获取历史测验失败' })
        }
    },
)

// 该课程错题聚合（仅已提交测验，按题干去重保留最近一次答错）
studynotesRouter.get('/:id/quiz/wrong', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const result = await getWrongQuestions(id)
        if (!result) {
            res.status(404).json({ error: '学习管理未找到' })
            return
        }

        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting wrong questions:', message)
        res.status(500).json({ error: '获取错题本失败' })
    }
})

// 指定测验详情（历史回看），仅允许已提交记录
studynotesRouter.get(
    '/:id/quiz/:quizId',
    async (req: Request, res: Response) => {
        try {
            const id = parsePosInt(req.params.id)
            const quizId = parsePosInt(req.params.quizId)
            if (id === -1 || quizId === -1) {
                res.status(400).json({ error: '无效的参数' })
                return
            }

            const result = await getQuizDetail(id, quizId)
            if (!result) {
                res.status(404).json({ error: '测验记录未找到' })
                return
            }

            res.json(result)
        } catch (error: unknown) {
            const message =
                error instanceof Error ? error.message : String(error)
            console.error('Error getting quiz detail:', message)
            res.status(500).json({ error: '获取测验详情失败' })
        }
    },
)
