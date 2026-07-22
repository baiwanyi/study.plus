import { callAi, logAiUsage } from './client'
import {
    defaultPromptEvaluateStudynotes,
    promptStudynotesFollowUpHeader,
    promptStudynotesFollowUpQuiz,
    promptStudynotesFollowUpRound1,
    promptStudynotesFollowUpSummary,
} from './prompts'
import { studynotesSubjectLabels } from '../constants'

export async function evaluateStudynotesReflection(
    subject: string,
    topic: string,
    summary: string,
    example: string,
    stuckPoints: string,
    context: { userId?: number },
): Promise<string> {
    const prompt = defaultPromptEvaluateStudynotes
        .replace('{subject}', studynotesSubjectLabels[subject] || subject || '未填写学科')
        .replace('{topic}', topic || '未填写课题')
        .replace('{summary}', summary || '未填写')
        .replace('{example}', example || '未填写')
        .replace('{stuckPoints}', stuckPoints || '未填写')

    try {
        const { content: reply, usage } = await callAi({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            maxTokens: 2000,
            responseFormat: { type: 'json_object' },
            quotaUserId: context.userId,
        })
        await logAiUsage('studynotes-evaluate', usage, {
            userId: context.userId,
            taskTitle: `学习心得评估：${topic || subject}`,
        })
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
    prevMessages: Array<{ role: string; content: string }>,
    userMessage: string | undefined,
    context: { userId?: number },
): Promise<string> {
    const roundNumber = prevMessages.filter((m) => m.role === 'user').length + 1
    const historyText =
        prevMessages.length > 0
            ? prevMessages
                  .map((m) => `${m.role === 'assistant' ? '老师' : '学生'}：${m.content}`)
                  .join('\n')
            : ''

    const subjectLabel = studynotesSubjectLabels[subject] || subject || '未填写学科'

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

    const prompt =
        promptStudynotesFollowUpHeader
            .replace('{subject}', subjectLabel)
            .replace('{topic}', topic || '未填写课题')
            .replace('{summary}', summary || '未填写')
            .replace('{example}', example || '未填写')
            .replace('{stuckPoints}', stuckPoints || '未填写') + sectionPrompt

    try {
        const { content: reply, usage } = await callAi({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            maxTokens: 4000,
            timeoutMs: 120_000,
            quotaUserId: context.userId,
        })
        await logAiUsage('studynotes-followup', usage, {
            userId: context.userId,
            taskTitle: `学习心得追问：${topic || subject}`,
        })
        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI follow-up error:', message)
        if (message.includes('内容为空') || message.includes('截断')) {
            return '测验出错：AI 返回为空，请稍后重试。如果持续出现，请检查 API 配置或联系管理员。'
        }
        if (message.includes('内容被过滤')) {
            return '测验出错：您的问题包含不合适的内容，已被 AI 过滤，请换一种方式回答。'
        }
        return `测验出错：${message}，请稍后重试`
    }
}
