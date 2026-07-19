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

interface DeepSeekChoice {
    message?: {
        content?: string
        role?: string
    }
    finish_reason?: string
}

interface DeepSeekResponse {
    choices?: DeepSeekChoice[]
    usage?: DeepSeekUsage
    error?: {
        message?: string
        type?: string
        code?: string
    }
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

    // 检查 API 级错误（即使 HTTP 200 也可能携带 error 字段）
    if (data.error?.message) {
        throw new Error(
            `DeepSeek API error: ${data.error.message}${data.error.code ? ` (code: ${data.error.code})` : ''}`,
        )
    }

    const choice = data.choices?.[0]
    const content = choice?.message?.content
    const finishReason = choice?.finish_reason

    if (!content) {
        // 记录完整诊断信息辅助排查
        const diagnostic = {
            finish_reason: finishReason,
            has_choices: !!data.choices,
            choices_length: data.choices?.length ?? 0,
            response_keys: Object.keys(data),
            model: 'deepseek-v4-flash',
        }
        console.warn('[DeepSeek Empty Response]', JSON.stringify(diagnostic))

        if (finishReason === 'content_filter') {
            throw new Error(
                'DeepSeek 内容被过滤，请修改问题后重试（finish_reason=content_filter）',
            )
        }
        if (finishReason === 'length') {
            throw new Error(
                'DeepSeek 响应被 max_tokens 限制截断导致内容为空，请增加 max_tokens 后重试',
            )
        }
        throw new Error('Empty response from DeepSeek')
    }

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

export { callDeepSeek, DEEPSEEK_API_KEY, logAiUsage, safeJsonParse }
export type {
    CallDeepSeekOptions,
    CallDeepSeekResult,
    DeepSeekMessage,
    DeepSeekParsedResult,
    DeepSeekUsage,
}
