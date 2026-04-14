import {
    taskTypeLabels,
    taskClassLabels,
    defaultGradeValues,
    taskTypeDefaultTitles,
} from '@apps/lib/utils'
import type { TaskType, TaskGrade } from '@apps/lib/types'
import {
    defaultTaskTitle,
    defaultPromptTaskTitleComposition,
    defaultPromptTaskTitleMindmap,
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
