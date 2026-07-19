import {
    defaultPromptEvaluateStudynotes,
    defaultPromptStudynotesFollowUp,
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
            () => studynotesSubjectLabels[subject] || subject || '未填写学科',
        )
        .replace('{topic}', () => topic || '未填写课题')
        .replace('{summary}', () => summary || '未填写')
        .replace('{example}', () => example || '未填写')
        .replace('{stuckPoints}', () => stuckPoints || '未填写')

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
        return 'AI 对话未配置，请设置 DEEPSEEK_API_KEY'
    }

    const roundNumber = prevMessages.filter((m) => m.role === 'user').length + 1
    const historyText =
        prevMessages.length > 0
            ? '已有对话历史：\n' +
              prevMessages
                  .map(
                      (m) =>
                          `${m.role === 'assistant' ? '老师' : '学生'}：${m.content}`,
                  )
                  .join('\n') +
              '\n\n'
            : ''
    const scoringText =
        roundNumber >= 5
            ? '这是最后一轮对话。请先回答学生的提问，然后对学生的回答进行简要打分（满分100分），并给出简短评语。格式：\n【回答】...\n【评分】XX分\n【评语】...'
            : ''

    let prompt = defaultPromptStudynotesFollowUp
        .replace(
            '{subject}',
            () => studynotesSubjectLabels[subject] || subject || '未填写学科',
        )
        .replace('{topic}', () => topic || '未填写课题')
        .replace('{summary}', () => summary || '未填写')
        .replace('{example}', () => example || '未填写')
        .replace('{stuckPoints}', () => stuckPoints || '未填写')
        .replace('{history}', () => historyText)
        .replace('{roundNumber}', () => String(roundNumber))
        .replace('{scoring}', () => scoringText)

    if (userMessage) {
        prompt += `\n\n---\n学生提问：\n"""\n${userMessage}\n"""\n---\n请直接回答学生上面提出的问题，用简单易懂的语言讲解。不要反问学生。`
    }

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 500,
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
        if (message.includes('Empty response')) {
            return '追问服务暂时不可用（AI 返回为空），请稍后重试。如果持续出现，请检查 API 配置或联系管理员。'
        }
        if (message.includes('内容被过滤')) {
            return '您的问题包含不合适的内容，已被 AI 过滤，请换一种方式提问。'
        }
        return `追问出错：${message}，请稍后重试`
    }
}
