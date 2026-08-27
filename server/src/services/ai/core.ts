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
    timeoutMs?: number
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
    retryCount = 0,
): Promise<CallDeepSeekResult> {
    const MAX_RETRIES = 3

    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY 未配置，无法调用 DeepSeek API')
    }

    const {
        messages,
        temperature,
        max_tokens,
        response_format,
        signal,
        timeoutMs,
    } = options

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        signal: signal ?? AbortSignal.timeout(timeoutMs ?? 30_000),
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
        // 非过滤类错误：自动重试（DeepSeek 服务端偶发空响应/网络抖动）。重试过程只打简洁日志，
        // 成功路径不刷屏；仅重试耗尽（最终失败）才打印完整诊断信息辅助排查。
        if (
            finishReason !== 'content_filter'
            && retryCount < MAX_RETRIES
        ) {
            // 指数退避（1s/2s/4s），比线性退避更贴合服务端偶发故障的恢复曲线
            const delay = 1000 * 2 ** retryCount
            // 截断（可自愈，预算问题）与真空响应（疑似服务端故障）用不同前缀，便于日志区分
            const logTag =
                finishReason === 'length'
                    ? '[DeepSeek Truncated]'
                    : '[DeepSeek Empty Response]'
            console.warn(
                `${logTag} 重试 ${retryCount + 1}/${MAX_RETRIES}（等待 ${delay}ms）${finishReason === 'length' ? '，检测到 max_tokens 截断，扩容重试' : ''}`,
            )
            await new Promise((r) => setTimeout(r, delay))
            // finish_reason='length' 说明输出被 max_tokens 截断，同样的限制重试必然再次截断；
            // 自动提高 max_tokens（1.5 倍，封顶 32000）再重试，避免无效重试
            const nextOptions: CallDeepSeekOptions =
                finishReason === 'length'
                    ? {
                          ...options,
                          max_tokens: Math.min(
                              32000,
                              Math.round((max_tokens ?? 8000) * 1.5),
                          ),
                      }
                    : options
            return callDeepSeek(nextOptions, retryCount + 1)
        }

        // 最终失败：记录完整诊断信息
        const diagnostic = {
            finish_reason: finishReason,
            has_choices: !!data.choices,
            choices_length: data.choices?.length ?? 0,
            response_keys: Object.keys(data),
            model: 'deepseek-v4-flash',
            retry_count: retryCount,
        }
        console.warn('[DeepSeek Empty Response] 重试耗尽', JSON.stringify(diagnostic))

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

/** 提取 JSON 主体：去除 markdown 围栏、多余前后缀（AI 常有的不稳定输出） */
function extractJsonBody(raw: string): string {
    let s = raw.trim()
    const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
    if (fenceMatch) s = fenceMatch[1].trim()
    const start = s.indexOf('{')
    const end = s.lastIndexOf('}')
    if (start >= 0 && end > start) s = s.slice(start, end + 1)
    return s
}

/** 将字符串值内的裸换行/制表符转义为合法 JSON（AI 常忘记转义导致 JSON.parse 失败） */
function escapeBareControlChars(json: string): string {
    let result = ''
    let inString = false
    let escaped = false
    for (const ch of json) {
        if (inString) {
            if (escaped) {
                result += ch
                escaped = false
                continue
            }
            if (ch === '\\') {
                result += ch
                escaped = true
                continue
            }
            if (ch === '"') {
                inString = false
                result += ch
                continue
            }
            if (ch === '\n' || ch === '\r' || ch === '\t') {
                result += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : '\\t'
                continue
            }
            result += ch
            continue
        }
        if (ch === '"') {
            inString = true
        }
        result += ch
    }
    return result
}

function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T
    } catch (err) {
        // 容错：修复 AI 常见的不稳定输出后重试解析
        const repaired = escapeBareControlChars(extractJsonBody(json))
        try {
            return JSON.parse(repaired) as T
        } catch (err2) {
            console.warn('[AI JSON Parse Failed]', {
                reason: err2 instanceof Error ? err2.message : String(err2),
                rawLength: json.length,
                repairedLength: repaired.length,
                rawHead: json.slice(0, 200),
                repairedHead: repaired.slice(0, 200),
            })
            return fallback
        }
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
