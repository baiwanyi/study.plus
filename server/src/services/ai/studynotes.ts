import {
    defaultPromptEvaluateStudynotes,
    promptAnalyzePreview,
    promptStudynotesQuizGenerate,
    promptStudynotesQuizGrade,
} from '@shared/constants'
import { decodeMultiSelection, studynotesSubjectLabels } from '@shared/utils'
import type {
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'
import {
    callDeepSeek,
    DEEPSEEK_API_KEY,
    logAiUsage,
    safeJsonParse,
} from './core'

export async function evaluateStudynotesReflection(
    subject: string,
    topic: string,
    summary: string,
    example: string,
    stuckPoints: string,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: 'AI 评估未配置，请设置 DEEPSEEK_API_KEY',
            missingPoints: [],
            errors: [],
            improvementSuggestions: ['请配置 API Key 后重新评估'],
            overallComment: '',
        })
    }

    const prompt = defaultPromptEvaluateStudynotes
        .replace(
            '{subject}',
            studynotesSubjectLabels[subject] || subject || '未填写学科',
        )
        .replace('{topic}', topic || '未填写课题')
        .replace('{summary}', summary || '未填写')
        .replace('{example}', example || '未填写')
        .replace('{stuckPoints}', stuckPoints || '未填写')

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
        })

        await logAiUsage(
            'notes-evaluate',
            usage,
            `学习管理评估：${topic || subject}`,
        )

        const parsed = safeJsonParse<Record<string, unknown> | null>(
            reply,
            null,
        )
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed) ||
            typeof parsed.completenessScore !== 'number' ||
            typeof parsed.completenessComment !== 'string' ||
            !Array.isArray(parsed.missingPoints) ||
            !Array.isArray(parsed.errors) ||
            !Array.isArray(parsed.improvementSuggestions)
        ) {
            throw new Error('Invalid evaluation response format')
        }

        // 返回规范化 JSON（而非 AI 原始字符串），避免 BOM/尾随空白/多余字段被原样落库
        return JSON.stringify(parsed)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI evaluation error:', message)
        // 不向前端透传内部错误详情，仅提示重试
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: '评估出错，请稍后重试',
            missingPoints: [],
            errors: [],
            improvementSuggestions: ['请稍后重试评估'],
            overallComment: '',
        })
    }
}

export async function analyzePreview(
    subject: string,
    topic: string,
    content: string,
    oldKnowledge: string,
    questions: string,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: 'AI 分析未配置，请设置 DEEPSEEK_API_KEY',
            strengths: [],
            gaps: [],
            classFocusPoints: [],
            overallComment: '',
        })
    }

    const prompt = promptAnalyzePreview
        .replace(
            '{subject}',
            studynotesSubjectLabels[subject] || subject || '未填写学科',
        )
        .replace('{topic}', topic || '未填写课题')
        .replace('{content}', content || '未填写')
        .replace('{oldKnowledge}', oldKnowledge || '未填写')
        .replace('{questions}', questions || '未填写')

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
        })

        await logAiUsage(
            'preview-analyze',
            usage,
            `课前预习分析：${topic || subject}`,
        )

        const parsed = safeJsonParse<Record<string, unknown> | null>(
            reply,
            null,
        )
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed) ||
            typeof parsed.completenessScore !== 'number' ||
            typeof parsed.completenessComment !== 'string' ||
            !Array.isArray(parsed.strengths) ||
            !Array.isArray(parsed.gaps) ||
            !Array.isArray(parsed.classFocusPoints)
        ) {
            throw new Error('Invalid preview analysis response format')
        }

        // 返回规范化 JSON（而非 AI 原始字符串），避免 BOM/尾随空白/多余字段被原样落库
        return JSON.stringify(parsed)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI preview analysis error:', message)
        // 不向前端透传内部错误详情，仅提示重试
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: '分析出错，请稍后重试',
            strengths: [],
            gaps: [],
            classFocusPoints: [],
            overallComment: '',
        })
    }
}

interface StudynotesCardInput {
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: string | null
}

function buildCardPrompt(card: StudynotesCardInput, template: string): string {
    const subjectLabel =
        studynotesSubjectLabels[card.subject] || card.subject || '未填写学科'
    return template
        .replace('{subject}', subjectLabel)
        .replace('{topic}', card.topic || '未填写课题')
        .replace('{summary}', card.summary || '未填写')
        .replace('{example}', card.example || '未填写')
        .replace('{stuckPoints}', card.stuckPoints || '未填写')
        .replace('{memoryHook}', card.memoryHook || '未填写')
}

export async function generateStudynotesQuiz(
    card: StudynotesCardInput,
): Promise<StudynotesQuizQuestion[]> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('AI 出题未配置，请设置 DEEPSEEK_API_KEY')
    }

    const prompt = buildCardPrompt(card, promptStudynotesQuizGenerate)

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            // 20 题含题干/选项/答案/解析，实测输出 6000~14000 tokens，12000 卡在临界值
            // 偶发触发「截断→扩容重试」（用户多等一轮生成、费用翻倍），故初始即给足 20000；
            // 若仍截断，callDeepSeek 检测到 finish_reason=length 会继续自动扩容重试
            max_tokens: 20000,
            response_format: { type: 'json_object' },
            timeoutMs: 120_000,
        })

        await logAiUsage(
            'quiz-question',
            usage,
            `学习管理出题：${card.topic || card.subject}`,
        )

        const parsed = safeJsonParse<{
            questions?: StudynotesQuizQuestion[]
        } | null>(reply, null)
        if (!parsed || !Array.isArray(parsed.questions)) {
            throw new Error('AI 返回的题目格式不正确')
        }

        // 过滤空题对象（题干为空则丢弃），避免空白题目入库
        const nonEmptyQuestions = parsed.questions.filter(
            (q) => String(q.question || '').trim().length > 0,
        )
        // AI 可能返回 19/21 题，最多截取前 20 题，避免偶发数量偏差导致整体失败
        const trimmed = nonEmptyQuestions.slice(0, 20)
        if (trimmed.length !== 20) {
            throw new Error('AI 返回的有效题目数量不足（应为20题）')
        }

        // 题型配比校验：简答恰好 10 题、单选/多选各至少 1 题（type 非法按 essay 计数，
        // 与下方 map 的回落口径一致），防止 AI 返回 20 题全为同一种题型
        const typeCounts = trimmed.reduce<Record<string, number>>((acc, q) => {
            const type =
                q.type === 'single' || q.type === 'multi' ? q.type : 'essay'
            acc[type] = (acc[type] ?? 0) + 1
            return acc
        }, {})
        if (
            (typeCounts.essay ?? 0) !== 10 ||
            (typeCounts.single ?? 0) < 1 ||
            (typeCounts.multi ?? 0) < 1
        ) {
            throw new Error(
                'AI 返回的题型配比不符合要求（简答10题，单选/多选各至少1题）',
            )
        }

        // 透传 type/options/answer/points：type 非法回落 essay；points 非法用合法默认值 5，
        // 避免被 sanitize 当作「分值非法」剔除导致题目不足（总分由 sanitize 兜底重分配为 100）
        return trimmed.map((q, i) => ({
            index: i + 1,
            type: q.type === 'single' || q.type === 'multi' ? q.type : 'essay',
            question: String(q.question || '').trim(),
            points:
                typeof q.points === 'number' &&
                Number.isFinite(q.points) &&
                q.points > 0
                    ? Math.round(q.points)
                    : 5,
            ...(Array.isArray(q.options)
                ? {
                      // 过滤空白选项，避免空串选项入库后被渲染成空白行
                      options: q.options
                          .map(String)
                          .filter((o) => o.trim().length > 0),
                  }
                : {}),
            ...(q.answer !== undefined && q.answer !== null
                ? { answer: String(q.answer) }
                : {}),
        }))
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI quiz generate error:', message)
        throw new Error(`出题失败：${message}`)
    }
}

export interface StudynotesQuizGradeResult {
    results: StudynotesQuizResult[]
    score: number
    correctCount: number
    comment: string
    suggestions: string[]
}

/**
 * 客观题本地判分（确定性判断，不依赖 AI）。
 * 判分口径（与分值体系对齐）：
 * - single：选中 === 答案 → 得 points 分；否则 0 分
 * - multi：无错选且全中 → 得 points 分；无错选但漏选 → 答对项数/答案项数 × points；
 *          存在错选 → 0 分
 * - 未作答一律 0 分
 */
export function gradeObjectiveQuestion(
    question: StudynotesQuizQuestion,
    answer: string,
): { isCorrect: boolean; score: number } {
    const points =
        Number.isFinite(question.points) && question.points > 0
            ? question.points
            : 10
    const student = answer.trim().toUpperCase()
    const standard = String(question.answer ?? '')
        .trim()
        .toUpperCase()
    if (!student || !standard) {
        return { isCorrect: false, score: 0 }
    }
    if (question.type === 'multi') {
        const correct = decodeMultiSelection(standard)
        // 学生答案先去重再判分：decodeMultiSelection 不去重，若学生提交 "A,A" 这类重复项，
        // 不去重会导致 selected.length 虚高而误判全中或虚增部分分
        const selected = [...new Set(decodeMultiSelection(student))]
        if (correct.length === 0) return { isCorrect: false, score: 0 }
        const correctSet = new Set(correct)
        // 存在错选（选了非正确答案项）→ 0 分
        const hasWrongPick = selected.some((s) => !correctSet.has(s))
        if (hasWrongPick) return { isCorrect: false, score: 0 }
        // 全中 → 满分（已排除错选，故选项数相等即全中）
        if (selected.length === correct.length) {
            return { isCorrect: true, score: points }
        }
        // 漏选 → 按答对比例给部分分（保留一位小数）
        const hitCount = selected.filter((s) => correctSet.has(s)).length
        const partial =
            Math.round(points * (hitCount / correct.length) * 10) / 10
        return { isCorrect: false, score: partial }
    }
    // single
    return student === standard
        ? { isCorrect: true, score: points }
        : { isCorrect: false, score: 0 }
}

export async function gradeStudynotesQuiz(
    card: StudynotesCardInput,
    questions: StudynotesQuizQuestion[],
    answers: string[],
): Promise<StudynotesQuizGradeResult> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('AI 批改未配置，请设置 DEEPSEEK_API_KEY')
    }

    // 客观题本地预判分（确定性）；主观题由 AI 判分。AI 仅负责为客观题生成解析、为主观题判分。
    const objectiveByIndex = new Map<
        number,
        { isCorrect: boolean; score: number }
    >()
    const subjectiveQuestions: StudynotesQuizQuestion[] = []
    questions.forEach((q, i) => {
        if (q.type === 'single' || q.type === 'multi') {
            objectiveByIndex.set(
                q.index,
                gradeObjectiveQuestion(q, answers[i] ?? ''),
            )
        } else {
            subjectiveQuestions.push(q)
        }
    })

    // 拼装 AI 批改输入：20 题全量回显（含题型/选项/标准答案），AI 据此出解析或判分
    const questionsAndAnswers = questions
        .map((q, i) => {
            const ans = answers[i] ?? ''
            const display = ans.trim() ? ans : '（未作答）'
            const typeLabel =
                q.type === 'essay'
                    ? '简答题'
                    : q.type === 'single'
                      ? '单选题'
                      : '多选题'
            const optionsText =
                Array.isArray(q.options) && q.options.length > 0
                    ? `\n选项：${q.options
                          .map(
                              (o, oi) =>
                                  `${String.fromCharCode(65 + oi)}. ${o}`,
                          )
                          .join('；')}`
                    : ''
            return `第${q.index}题（${typeLabel}）：${q.question}${optionsText}\n标准答案：${q.answer ?? ''}\n学生答案：${display}`
        })
        .join('\n\n')

    const prompt = buildCardPrompt(card, promptStudynotesQuizGrade).replace(
        '{questionsAndAnswers}',
        questionsAndAnswers,
    )

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            // 20 题全量回显 + 解析，输出量大，上限给足避免截断导致 JSON 未闭合
            max_tokens: 24000,
            response_format: { type: 'json_object' },
            timeoutMs: 240_000,
        })

        await logAiUsage(
            'quiz-marking',
            usage,
            `学习管理批改：${card.topic || card.subject}`,
        )

        const parsed = safeJsonParse<{
            results?: StudynotesQuizResult[]
            comment?: string
            suggestions?: string[]
        } | null>(reply, null)
        // 有主观题时必须依赖 AI 返回判分结果：results 为空数组等同未返回，直接判失败，
        // 避免下方逐题补齐 0 分导致「AI 全漏」被静默掩盖成整卷 0 分
        if (
            !parsed ||
            (subjectiveQuestions.length > 0 &&
                (!Array.isArray(parsed.results) || parsed.results.length === 0))
        ) {
            throw new Error('AI 返回的批改结果为空')
        }

        const aiResultByIndex = new Map<number, StudynotesQuizResult>()
        for (const r of parsed.results ?? []) {
            const idx = Number(r.index)
            if (Number.isInteger(idx)) aiResultByIndex.set(idx, r)
        }

        // 装配每道题结果：客观题用本地判分（isCorrect/score 以本地为准），解析回填 AI 输出；
        // 主观题用 AI 判分，缺失则该题跳过（沿用现有容错）
        const results = questions
            .map((q, i): StudynotesQuizResult | null => {
                const studentAnswer = answers[i] ?? ''
                const aiRes = aiResultByIndex.get(q.index)
                if (q.type === 'single' || q.type === 'multi') {
                    const local = objectiveByIndex.get(q.index) ?? {
                        isCorrect: false,
                        score: 0,
                    }
                    const explanation = String(aiRes?.explanation ?? '').trim()
                    return {
                        index: q.index,
                        question: q.question,
                        studentAnswer,
                        isCorrect: local.isCorrect,
                        score: local.score,
                        correctAnswer:
                            q.answer ?? String(aiRes?.correctAnswer ?? ''),
                        // AI 未回填解析时用本地兜底文案，保证批改结果可读
                        explanation:
                            explanation || `正确答案是${q.answer ?? ''}`,
                    }
                }
                // 主观题：缺失该题 AI 判分结果时按 0 分兜底，保证 results 与题目一一对应、
                // 总分口径一致（避免缺题拉低总分且前端无该题结果）
                if (!aiRes) {
                    return {
                        index: q.index,
                        question: q.question,
                        studentAnswer,
                        isCorrect: false,
                        score: 0,
                        correctAnswer: q.answer ?? '',
                        explanation: 'AI 未返回该题判分结果',
                    }
                }
                const isAnswerEmpty = !studentAnswer.trim()
                // AI 返回 0-10 比例分 → 按该题 points 换算实分
                const aiScore = Number(aiRes.score)
                const rawScore = Number.isFinite(aiScore) ? aiScore : 0
                const ratioScore = isAnswerEmpty
                    ? 0
                    : Math.min(10, Math.max(0, Math.round(rawScore * 10) / 10))
                const points =
                    Number.isFinite(q.points) && q.points > 0 ? q.points : 10
                const score = Math.round(points * (ratioScore / 10) * 10) / 10
                return {
                    index: q.index,
                    question: q.question,
                    studentAnswer,
                    // 仅当显式为 true 或字符串 'true' 才算正确，避免 Boolean('false') === true 的失真
                    isCorrect:
                        !isAnswerEmpty &&
                        ratioScore === 10 &&
                        (aiRes.isCorrect === true ||
                            String(aiRes.isCorrect) === 'true'),
                    score,
                    correctAnswer: String(aiRes.correctAnswer ?? ''),
                    explanation: String(aiRes.explanation ?? ''),
                }
            })
            .filter((r): r is StudynotesQuizResult => r !== null)
        // 答对数 = 完全正确的题数；总分 = Σ每题实得分（Σpoints 恒为 100，故为百分制）
        const correctCount = results.filter((r) => r.isCorrect).length
        const score =
            Math.round(results.reduce((sum, r) => sum + r.score, 0) * 10) / 10

        return {
            results,
            score,
            correctCount,
            comment: String(parsed.comment ?? ''),
            suggestions: Array.isArray(parsed.suggestions)
                ? parsed.suggestions
                      .map(String)
                      .filter((s) => s.trim().length > 0)
                : [],
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI quiz grade error:', message)
        throw new Error(`批改失败：${message}`)
    }
}
