import {
    defaultPromptEvaluateStudynotes,
    promptStudynotesFollowUpHeader,
    promptStudynotesFollowUpQuiz,
    promptStudynotesFollowUpRound1,
    promptStudynotesFollowUpSummary,
} from '@shared/constants'
import { studynotesSubjectLabels } from '@shared/utils'
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

export async function studynotesFollowUpChat(
    subject: string,
    topic: string,
    summary: string,
    example: string,
    stuckPoints: string,
    prevMessages: { role: string; content: string }[],
    userMessage?: string,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return '测验出错：AI 对话未配置，请设置 DEEPSEEK_API_KEY'
    }

    const roundNumber = prevMessages.filter((m) => m.role === 'user').length + 1
    const historyText =
        prevMessages.length > 0
            ? prevMessages
                  .map(
                      (m) =>
                          `${m.role === 'assistant' ? '老师' : '学生'}：${m.content}`,
                  )
                  .join('\n')
            : ''

    const subjectLabel = studynotesSubjectLabels[subject] || subject || '未填写学科'

    // 按轮次选择对应的指令段落，避免 AI 看到无关指令产生误导
    let sectionPrompt: string
    if (roundNumber === 1) {
        sectionPrompt = promptStudynotesFollowUpRound1
    } else if (roundNumber <= 10) {
        sectionPrompt = promptStudynotesFollowUpQuiz
            .replace('{history}', historyText)
            .replace('{studentAnswer}', userMessage || '')
            .replace('{roundNumber}', String(roundNumber))
    } else {
        sectionPrompt = promptStudynotesFollowUpSummary
            .replace('{history}', historyText)
            .replace('{studentAnswer}', userMessage || '')
    }

    const prompt = promptStudynotesFollowUpHeader
        .replace('{subject}', subjectLabel)
        .replace('{topic}', topic || '未填写课题')
        .replace('{summary}', summary || '未填写')
        .replace('{example}', example || '未填写')
        .replace('{stuckPoints}', stuckPoints || '未填写')
        + sectionPrompt

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 4000,
            timeoutMs: 120_000,
        })

        await logAiUsage(
            'studynotes-followup',
            usage,
            `学习心得追问：${topic || subject}`,
        )

        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI follow-up error:', message)

        // 针对特定错误类型给出更友好的提示
        if (message.includes('Empty response') || message.includes('截断')) {
            return '测验出错：AI 返回为空，请稍后重试。如果持续出现，请检查 API 配置或联系管理员。'
        }
        if (message.includes('内容被过滤')) {
            return '测验出错：您的问题包含不合适的内容，已被 AI 过滤，请换一种方式回答。'
        }
        return `测验出错：${message}，请稍后重试`
    }
}
