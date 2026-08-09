import {
    defaultPromptEvaluateStudynotes,
    promptAnalyzePreview,
    promptStudynotesQuizGenerate,
    promptStudynotesQuizGrade,
} from '@shared/constants'
import { studynotesSubjectLabels } from '@shared/utils'
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
            'studynotes-evaluate',
            usage,
            `学习心得评估：${topic || subject}`,
        )

        const parsed = safeJsonParse<Record<string, unknown> | null>(
            reply,
            null,
        )
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid evaluation response format')
        }

        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI evaluation error:', message)
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: `评估出错：${message}`,
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
            'studynotes-preview-analyze',
            usage,
            `课前预习分析：${topic || subject}`,
        )

        const parsed = safeJsonParse<Record<string, unknown> | null>(
            reply,
            null,
        )
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid preview analysis response format')
        }

        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI preview analysis error:', message)
        return JSON.stringify({
            completenessScore: 0,
            completenessComment: `分析出错：${message}`,
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
            max_tokens: 4000,
            response_format: { type: 'json_object' },
            timeoutMs: 120_000,
        })

        await logAiUsage(
            'studynotes-quiz-generate',
            usage,
            `学习心得出题：${card.topic || card.subject}`,
        )

        const parsed = safeJsonParse<{
            questions?: StudynotesQuizQuestion[]
        } | null>(reply, null)
        if (!parsed || !Array.isArray(parsed.questions)) {
            throw new Error('AI 返回的题目格式不正确')
        }

        // 过滤空题并校验有效题数，防止空白题目入库
        const validQuestions = parsed.questions
            .map((q) => String(q.question || '').trim())
            .filter((q) => q.length > 0)
        if (validQuestions.length !== 10) {
            throw new Error('AI 返回的有效题目数量不足（应为10题）')
        }

        return parsed.questions.map((q, i) => ({
            index: i + 1,
            question: String(q.question || '').trim(),
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

export async function gradeStudynotesQuiz(
    card: StudynotesCardInput,
    questions: StudynotesQuizQuestion[],
    answers: string[],
): Promise<StudynotesQuizGradeResult> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('AI 批改未配置，请设置 DEEPSEEK_API_KEY')
    }

    const questionsAndAnswers = questions
        .map((q, i) => {
            const ans = answers[i] ?? ''
            const display = ans.trim() ? ans : '（未作答）'
            return `第${q.index}题：${q.question}\n学生答案：${display}`
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
            // 批改需回显 10 题题干/答案/解析，输出量大，上限过低易被截断导致 JSON 未闭合，尽量给足
            max_tokens: 16000,
            response_format: { type: 'json_object' },
            timeoutMs: 180_000,
        })

        await logAiUsage(
            'studynotes-quiz-grade',
            usage,
            `学习心得批改：${card.topic || card.subject}`,
        )

        const parsed = safeJsonParse<{
            results?: StudynotesQuizResult[]
            score?: number
            correctCount?: number
            comment?: string
            suggestions?: string[]
        } | null>(reply, null)
        if (
            !parsed ||
            !Array.isArray(parsed.results) ||
            parsed.results.length !== questions.length
        ) {
            throw new Error('AI 返回的批改结果与题目数量不匹配')
        }

        // 空答案（空白/纯空格）强制判错得 0 分，不依赖 AI 判断，确保与前端空答案 XCircle 标记一致
        // AI 仅返回判分结果（index/isCorrect/score/correctAnswer/explanation），question/studentAnswer 用库内数据补全
        const questionByIndex = new Map(
            questions.map((q) => [q.index, q.question]),
        )
        const results = parsed.results.map((r) => {
            const idx = Number(r.index)
            const isAnswerEmpty = !(answers[idx - 1] ?? '').trim()
            // 该题得分（0-10，可含一位小数）；空答案强制 0 分，避免 AI 误判
            const aiScore = Number(r.score)
            const rawScore = Number.isFinite(aiScore) ? aiScore : 0
            const score = isAnswerEmpty
                ? 0
                : Math.min(10, Math.max(0, Math.round(rawScore * 10) / 10))
            return {
                index: idx,
                question: questionByIndex.get(idx) ?? String(r.question ?? '').trim(),
                studentAnswer: answers[idx - 1] ?? String(r.studentAnswer ?? ''),
                // 仅当显式为 true 或字符串 'true' 才算正确，避免 Boolean('false') === true 的失真
                isCorrect:
                    !isAnswerEmpty &&
                    score === 10 &&
                    (r.isCorrect === true || String(r.isCorrect) === 'true'),
                score,
                correctAnswer: String(r.correctAnswer ?? ''),
                explanation: String(r.explanation ?? ''),
            }
        })
        // 答对数 = 完全正确的题数；百分制总分 = Σ每题得分 ÷ 满分（题数 × 10）× 100
        const correctCount = results.filter((r) => r.isCorrect).length
        const totalScore = results.reduce((sum, r) => sum + r.score, 0)
        const score = Math.round(
            (totalScore / (questions.length * 10)) * 100,
        )

        return {
            results,
            score,
            correctCount,
            comment: String(parsed.comment ?? ''),
            suggestions: Array.isArray(parsed.suggestions)
                ? parsed.suggestions.map(String)
                : [],
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI quiz grade error:', message)
        throw new Error(`批改失败：${message}`)
    }
}
