import type {
    ChatMessage,
    WeeklyAnalysis,
} from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'

import {
    callDeepSeek,
    DEEPSEEK_API_KEY,
    logAiUsage,
    safeJsonParse,
} from './core'
import type { DeepSeekMessage } from './core'

export async function analyzeWeeklyReport(
    content: WeeklyReportContent,
    weekLabel?: string,
    teacherName?: string,
    studentGrade?: string,
): Promise<WeeklyAnalysis> {
    if (!DEEPSEEK_API_KEY) {
        return {
            praise: 'AI 分析未配置，请设置 DEEPSEEK_API_KEY',
            difficultyHelp: '',
            goalAdvice: '',
            aiFeedbackAdvice: '',
            summary: '',
        }
    }

    const teacherPrefix = teacherName ? `${teacherName}老师` : '老师'
    const gradePrefix = studentGrade ? `（${studentGrade}）` : ''
    const prompt = `你是一位专业的学习辅导老师${teacherPrefix}，请针对${gradePrefix}学生，对以下学习周报进行分析并生成鼓励和建议。

周报内容：
- 学到的东西：${content.learned.slice(0, 4000)}
- 遇到的困难：${content.difficulties.slice(0, 4000)}
- 没有掌握的知识点：${content.weakPoints.slice(0, 4000)}
- 最有成就感的事：${content.achievement.slice(0, 4000)}
- 上周目标达成情况：${content.lastWeekGoalReview.slice(0, 4000)}
- SMART目标 - 具体(S)：${content.smartGoalS.slice(0, 4000)}
- SMART目标 - 可衡量(M)：${content.smartGoalM.slice(0, 4000)}
- SMART目标 - 可实现(A)：${content.smartGoalA.slice(0, 4000)}
- SMART目标 - 相关(R)：${content.smartGoalR.slice(0, 4000)}
- SMART目标 - 有时限(T)：${content.smartGoalT.slice(0, 4000)}
- 改进方法：${content.improvement.slice(0, 4000)}

请返回 JSON 格式，包含以下字段：
1. praise: 对学到的东西和成就感进行鼓励和表扬，提出更多建议（200字以内）
2. difficultyHelp: 对遇到的困难和未掌握的知识点进行分析，提供解决方案（300字以内）
3. goalAdvice: 对SMART目标、改进方法进行分析和完善建议（200字以内）
4. aiFeedbackAdvice: 给予整体建议和鼓励（100字以内）
5. summary: 总体评价，积极正面（100字以内）

注意：在回复内容中，请以「${teacherPrefix}」自称。如「${teacherPrefix}的小建议：」`

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
        })

        await logAiUsage(
            'weekly-analyze',
            usage,
            weekLabel ? `${weekLabel}·周报分析` : '周报分析',
        )

        const parsed = safeJsonParse<Partial<WeeklyAnalysis> | null>(
            reply,
            null,
        )
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Invalid weekly analysis response format')
        }

        return {
            praise: parsed.praise || '',
            difficultyHelp: parsed.difficultyHelp || '',
            goalAdvice: parsed.goalAdvice || '',
            aiFeedbackAdvice: parsed.aiFeedbackAdvice || '',
            summary: parsed.summary || '',
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI weekly analyze error:', message)
        return {
            praise: `分析出错：${message}，请稍后重试`,
            difficultyHelp: '',
            goalAdvice: '',
            aiFeedbackAdvice: '',
            summary: '',
        }
    }
}

export async function chatAboutWeeklyReport(
    content: WeeklyReportContent,
    messages: ChatMessage[],
    weekLabel?: string,
    teacherName?: string,
    studentGrade?: string,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return 'AI 对话未配置，请设置 DEEPSEEK_API_KEY'
    }

    const teacherPrefix = teacherName ? `${teacherName}老师` : '老师'
    const gradePrefix = studentGrade ? `（${studentGrade}）` : ''
    const systemPrompt = `你是${teacherPrefix}${gradePrefix}，一位学习周报助手，基于以下周报内容回答孩子的问题。请用友善、鼓励的语气，帮助孩子改进学习方法。在回复中请以「${teacherPrefix}」自称。

周报内容：
- 学到的东西：${content.learned.slice(0, 4000)}
- 遇到的困难：${content.difficulties.slice(0, 4000)}
- 没有掌握的知识点：${content.weakPoints.slice(0, 4000)}
- 最有成就感的事：${content.achievement.slice(0, 4000)}
- 上周目标达成情况：${content.lastWeekGoalReview.slice(0, 4000)}
- SMART目标 - 具体(S)：${content.smartGoalS.slice(0, 4000)}
- SMART目标 - 可衡量(M)：${content.smartGoalM.slice(0, 4000)}
- SMART目标 - 可实现(A)：${content.smartGoalA.slice(0, 4000)}
- SMART目标 - 相关(R)：${content.smartGoalR.slice(0, 4000)}
- SMART目标 - 有时限(T)：${content.smartGoalT.slice(0, 4000)}
- 改进方法：${content.improvement.slice(0, 4000)}`

    const apiMessages: DeepSeekMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
            role: m.role,
            content: m.content,
        })),
    ]

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 2000,
        })

        await logAiUsage(
            'weekly-chat',
            usage,
            weekLabel ? `${weekLabel}·周报对话` : '周报对话',
        )

        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI weekly chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}
