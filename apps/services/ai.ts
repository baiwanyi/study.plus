import {
    taskTypeLabels,
    taskClassLabels,
    defaultGradeValues,
    taskTypeDefaultTitles,
} from '@apps/lib/utils'
import type { TaskType, TaskGrade, WeeklyAnalysis, ChatMessage } from '@apps/lib/types'
import type { WeeklyReportContent } from '@apps/lib/weekly'
import {
    defaultTaskTitle,
    defaultPromptTaskTitleComposition,
    defaultPromptTaskTitleMindmap,
    defaultPromptTaskTitleNotes,
    defaultPromptGenerateTitle,
    defaultPromptScoreComposition,
} from '@apps/lib/default'

const DEEPSEEK_BASE_URL: string =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_API_KEY: string | undefined = process.env.DEEPSEEK_API_KEY

export interface AIScoreResult {
    grade: TaskGrade
    score: number
    comment: string
    suggestions: string[]
}

interface DeepSeekMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

interface DeepSeekUsage {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
}

interface DeepSeekResponse {
    choices?: Array<{
        message?: {
            content?: string
        }
    }>
    usage?: DeepSeekUsage
}

interface DeepSeekParsedResult {
    grade: string
    score: number | string
    comment: string
    suggestions: string[]
}

async function logAiUsage(
    project: string,
    usage: DeepSeekUsage | undefined,
    taskTitle?: string,
    taskId?: number,
): Promise<void> {
    if (!usage) return
    try {
        const { db } = await import('@apps/db/index')
        const { aiUsageLogs } = await import('@apps/db/schema')
        const truncatedTitle =
            taskTitle && taskTitle.length > 16
                ? taskTitle.slice(0, 16) + '...'
                : taskTitle

        await db.insert(aiUsageLogs).values({
            project,
            taskId: taskId ?? null,
            taskTitle: truncatedTitle ?? null,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
        })
    } catch (err) {
        // AI 使用记录失败不影响主流程，仅记录日志
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[AI Usage Log Failed]', msg)
    }
}

export async function generateTaskTitle(
    type: TaskType,
    grade: number,
): Promise<string> {
    const prompt = {
        mindmap: defaultPromptTaskTitleMindmap.replace(
            '{taskGrade}',
            taskClassLabels[grade],
        ),
        composition: defaultPromptTaskTitleComposition.replace(
            '{taskGrade}',
            taskClassLabels[grade],
        ),
        notes: defaultPromptTaskTitleNotes.replace(
            '{taskGrade}',
            taskClassLabels[grade],
        ),
    }

    if (!DEEPSEEK_API_KEY) {
        return `${taskClassLabels[grade]}${taskTypeLabels[type]}：${defaultTaskTitle[type]}`
    }

    try {
        const response: Response = await fetch(
            `${DEEPSEEK_BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        {
                            role: 'user',
                            content: prompt[type],
                        } as DeepSeekMessage,
                    ],
                    temperature: 0.8,
                    max_tokens: 60,
                }),
            },
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(
                `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
            )
        }

        const data: DeepSeekResponse =
            (await response.json()) as DeepSeekResponse
        const rawContent: string | undefined =
            data.choices?.[0]?.message?.content
        if (!rawContent) throw new Error('Empty response from DeepSeek')

        await logAiUsage('ai-task', data.usage, rawContent)
        return rawContent
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI generate title error:', message)
        return `${taskClassLabels[grade]}${taskTypeLabels[type]}：${defaultTaskTitle[type]}`
    }
}

export async function generateTitle(
    content: string,
    type: TaskType,
    taskId?: number,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return taskTypeDefaultTitles[type]
    }

    const prompt: string = defaultPromptGenerateTitle
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskContent}', content.slice(0, 2000))

    try {
        const response: Response = await fetch(
            `${DEEPSEEK_BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'user', content: prompt } as DeepSeekMessage,
                    ],
                    temperature: 0.7,
                    max_tokens: 50,
                }),
            },
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(
                `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
            )
        }

        const data: DeepSeekResponse =
            (await response.json()) as DeepSeekResponse
        const rawContent: string | undefined =
            data.choices?.[0]?.message?.content
        if (!rawContent) throw new Error('Empty response from DeepSeek')

        await logAiUsage('ai-title', data.usage, rawContent, taskId)
        return rawContent
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI title generation error:', message)
        return taskTypeDefaultTitles[type]
    }
}

export async function scoreComposition(
    content: string,
    type: TaskType,
    title?: string,
    taskId?: number,
): Promise<AIScoreResult> {
    if (!DEEPSEEK_API_KEY) {
        return {
            grade: 'B',
            score: 75,
            comment: 'AI 评分未配置，默认评分为 B',
            suggestions: ['请配置 DEEPSEEK_API_KEY 以启用 AI 评分'],
        }
    }

    const taskTitle = title ? `题目：${title}` : '无指定题目，请根据内容评判'
    const prompt: string = defaultPromptScoreComposition
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskTitle}', taskTitle)
        .replace('{taskContent}', content)

    try {
        const response: Response = await fetch(
            `${DEEPSEEK_BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'user', content: prompt } as DeepSeekMessage,
                    ],
                    temperature: 0.3,
                    response_format: { type: 'json_object' },
                }),
            },
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(
                `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
            )
        }

        const data: DeepSeekResponse =
            (await response.json()) as DeepSeekResponse
        const rawContent: string | undefined =
            data.choices?.[0]?.message?.content
        if (!rawContent) throw new Error('Empty response from DeepSeek')

        await logAiUsage('ai-score', data.usage, title, taskId)

        const result: DeepSeekParsedResult = JSON.parse(
            rawContent,
        ) as DeepSeekParsedResult

        const grade: TaskGrade = defaultGradeValues.includes(
            result.grade as TaskGrade,
        )
            ? (result.grade as TaskGrade)
            : 'B'

        return {
            grade,
            score: Number(result.score) || 75,
            comment: result.comment || '',
            suggestions: Array.isArray(result.suggestions)
                ? result.suggestions
                : [],
        }
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI scoring error:', message)
        return {
            grade: 'B',
            score: 75,
            comment: `AI 评分出错：${message}`,
            suggestions: ['请稍后重试'],
        }
    }
}

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
- 学到的东西：${content.learned}
- 遇到的困难：${content.difficulties}
- 没有掌握的知识点：${content.weakPoints}
- 最有成就感的事：${content.achievement}
- 上周目标达成情况：${content.lastWeekGoalReview}
- SMART目标 - 具体(S)：${content.smartGoalS}
- SMART目标 - 可衡量(M)：${content.smartGoalM}
- SMART目标 - 可实现(A)：${content.smartGoalA}
- SMART目标 - 相关(R)：${content.smartGoalR}
- SMART目标 - 有时限(T)：${content.smartGoalT}
- 改进方法：${content.improvement}

请返回 JSON 格式，包含以下字段：
1. praise: 对学到的东西和成就感进行鼓励和表扬，提出更多建议（200字以内）
2. difficultyHelp: 对遇到的困难和未掌握的知识点进行分析，提供解决方案（300字以内）
3. goalAdvice: 对SMART目标、改进方法进行分析和完善建议（200字以内）
4. aiFeedbackAdvice: 给予整体建议和鼓励（100字以内）
5. summary: 总体评价，积极正面（100字以内）

注意：在回复内容中，请以「${teacherPrefix}」自称。如「${teacherPrefix}的小建议：」`

    try {
        const response: Response = await fetch(
            `${DEEPSEEK_BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'user', content: prompt } as DeepSeekMessage,
                    ],
                    temperature: 0.7,
                    max_tokens: 2000,
                    response_format: { type: 'json_object' },
                }),
            },
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(
                `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
            )
        }

        const data: DeepSeekResponse =
            (await response.json()) as DeepSeekResponse
        const rawContent: string | undefined =
            data.choices?.[0]?.message?.content
        if (!rawContent) throw new Error('Empty response from DeepSeek')

        await logAiUsage('weekly-analyze', data.usage, weekLabel ? `${weekLabel}·周报分析` : '周报分析')

        return JSON.parse(rawContent) as WeeklyAnalysis
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
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
- 学到的东西：${content.learned}
- 遇到的困难：${content.difficulties}
- 没有掌握的知识点：${content.weakPoints}
- 最有成就感的事：${content.achievement}
- 上周目标达成情况：${content.lastWeekGoalReview}
- SMART目标 - 具体(S)：${content.smartGoalS}
- SMART目标 - 可衡量(M)：${content.smartGoalM}
- SMART目标 - 可实现(A)：${content.smartGoalA}
- SMART目标 - 相关(R)：${content.smartGoalR}
- SMART目标 - 有时限(T)：${content.smartGoalT}
- 改进方法：${content.improvement}`

    const apiMessages: DeepSeekMessage[] = [
        { role: 'system', content: systemPrompt } as DeepSeekMessage,
        ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        })) as DeepSeekMessage[],
    ]

    try {
        const response: Response = await fetch(
            `${DEEPSEEK_BASE_URL}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: 'deepseek-chat',
                    messages: apiMessages,
                    temperature: 0.7,
                    max_tokens: 2000,
                }),
            },
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error')
            throw new Error(
                `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
            )
        }

        const data: DeepSeekResponse =
            (await response.json()) as DeepSeekResponse
        const reply: string | undefined = data.choices?.[0]?.message?.content
        if (!reply) throw new Error('Empty response from DeepSeek')

        await logAiUsage('weekly-chat', data.usage, weekLabel ? `${weekLabel}·周报对话` : '周报对话')

        return reply
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI weekly chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}
