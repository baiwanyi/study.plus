import type { TaskGrade } from '@shared/types'

const DEEPSEEK_BASE_URL =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

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

interface CallDeepSeekOptions {
    messages: DeepSeekMessage[]
    temperature?: number
    max_tokens?: number
    response_format?: { type: 'json_object' }
    signal?: AbortSignal
}

interface CallDeepSeekResult {
    content: string
    usage?: DeepSeekUsage
}

async function logAiUsage(
    project: string,
    usage: DeepSeekUsage | undefined,
    taskTitle?: string,
    taskId?: number,
): Promise<void> {
    if (!usage) return
    try {
        const { db } = await import('../../db/index')
        const { aiUsageLogs } = await import('../../db/schema')
        const truncatedTitle =
            taskTitle && taskTitle.length > 16
                ? taskTitle.slice(0, 16) + '...'
                : taskTitle

        await db.insert(aiUsageLogs).values({
            project,
            taskId: taskId ?? null,
            taskTitle: truncatedTitle || null,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
        })
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[AI Usage Log Failed]', msg)
    }
}

async function callDeepSeek(
    options: CallDeepSeekOptions,
): Promise<CallDeepSeekResult> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY 未配置，无法调用 DeepSeek API')
    }

    const { messages, temperature, max_tokens, response_format, signal } =
        options

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        signal: signal ?? AbortSignal.timeout(30_000),
        body: JSON.stringify({
            model: 'deepseek-v4-flash',
            messages,
            temperature: temperature ?? 0.7,
            ...(max_tokens !== undefined ? { max_tokens } : {}),
            ...(response_format ? { response_format } : {}),
        }),
    })

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(
            `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
        )
    }

    const data = (await response.json()) as DeepSeekResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty response from DeepSeek')

    return { content, usage: data.usage }
}

function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T
    } catch {
        console.warn('[AI JSON Parse Failed]', json.slice(0, 200))
        return fallback
    }
}

export {
    callDeepSeek,
    DEEPSEEK_API_KEY,
    logAiUsage,
    safeJsonParse,
}
export type {
    CallDeepSeekOptions,
    CallDeepSeekResult,
    DeepSeekMessage,
    DeepSeekParsedResult,
    DeepSeekUsage,
}
