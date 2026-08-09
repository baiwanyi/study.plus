import {
    defaultPromptEvaluateStudynotes,
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

interface StudynotesCardInput {
    subject: string
    topic: string
    summary: string
    example: string
    stuckPoints: string
    memoryHook?: string | null
}

function buildCardPrompt(
    card: StudynotesCardInput,
    template: string,
): string {
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
        if (
            !parsed ||
            !Array.isArray(parsed.questions) ||
            parsed.questions.length !== 10
        ) {
            throw new Error('AI 返回的题目数量不正确（应为10题）')
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
            return `第${q.index}题：${q.question}\n学生答案：${ans || '（空）'}`
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
            max_tokens: 6000,
            response_format: { type: 'json_object' },
            timeoutMs: 120_000,
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

        return {
            results: parsed.results.map((r) => ({
                index: r.index,
                question: String(r.question || '').trim(),
                studentAnswer: String(r.studentAnswer ?? ''),
                isCorrect: Boolean(r.isCorrect),
                correctAnswer: String(r.correctAnswer ?? ''),
                explanation: String(r.explanation ?? ''),
            })),
            score: Number(parsed.score ?? 0),
            correctCount: Number(parsed.correctCount ?? 0),
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
