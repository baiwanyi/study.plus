/**
 * AI 调用核心模块：封装 DeepSeek 对话补全、用量落库与 JSON 容错解析。
 * 复用约定：统一经 fetch 调用 chat/completions，超时由 AbortSignal 控制；用量经 logAiUsage
 * 异步落库辅助计费分析，业务侧 JSON 解析统一走 safeJsonParse 容错 AI 常见的不稳定输出。
 * 关键约束：空响应与 JSON 模式下的 max_tokens 截断均属可自愈故障，须指数退避并扩容 token
 * 上限后重试；重试耗尽或已无扩容空间时抛出明确错误，绝不返回残缺 JSON 误导调用方。
 */
import type { TaskGrade } from '@shared/types'

const DEEPSEEK_BASE_URL =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

/** max_tokens 扩容上限，超过该值请求会被服务端拒绝 */
const MAX_TOKENS_CEILING = 32000
/** 未显式指定 max_tokens 时的扩容基准值 */
const DEFAULT_MAX_TOKENS = 8000

/** 截断后按 1.5 倍扩容 max_tokens（封顶 MAX_TOKENS_CEILING），避免同一上限重复截断 */
function growMaxTokens(maxTokens: number | undefined): number {
    return Math.min(
        MAX_TOKENS_CEILING,
        Math.round((maxTokens ?? DEFAULT_MAX_TOKENS) * 1.5),
    )
}

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

    // JSON 模式下 AI 必须输出完整结构，一旦被 max_tokens 截断，字符串必然未闭合、解析必然失败，
    // 故「截断」与「空响应」同属可自愈故障，统一纳入重试（纯文本调用仍允许返回截断内容）
    const expectsJson = response_format?.type === 'json_object'
    const truncated = finishReason === 'length' && expectsJson
    const nextMaxTokens = growMaxTokens(max_tokens)
    const canGrow = nextMaxTokens > (max_tokens ?? DEFAULT_MAX_TOKENS)

    // 非过滤类错误自动重试（DeepSeek 服务端偶发空响应/网络抖动）。重试过程只打简洁日志，
    // 成功路径不刷屏；仅重试耗尽（最终失败）才打印完整诊断信息辅助排查。
    if (
        finishReason !== 'content_filter'
        && retryCount < MAX_RETRIES
        && (!content || (truncated && canGrow))
    ) {
        // 指数退避（1s/2s/4s），比线性退避更贴合服务端偶发故障的恢复曲线
        const delay = 1000 * 2 ** retryCount
        // 截断（预算不足，可扩容自愈）与真空响应（疑似服务端故障）用不同前缀，便于日志区分
        const logTag = truncated
            ? '[DeepSeek Truncated]'
            : '[DeepSeek Empty Response]'
        console.warn(
            `${logTag} 重试 ${retryCount + 1}/${MAX_RETRIES}（等待 ${delay}ms）${
                truncated
                    ? `，检测到 max_tokens 截断，由 ${max_tokens ?? DEFAULT_MAX_TOKENS} 扩容至 ${nextMaxTokens} 重试`
                    : ''
            }`,
        )
        await new Promise((r) => setTimeout(r, delay))
        // 截断说明原有上限不够用，沿用同一限制重试必然再次截断，必须先扩容再重试
        const nextOptions: CallDeepSeekOptions = truncated
            ? { ...options, max_tokens: nextMaxTokens }
            : options
        return callDeepSeek(nextOptions, retryCount + 1)
    }

    if (!content) {
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

    // 截断且已无扩容空间：残缺 JSON 对调用方毫无价值，直接失败并提示精简输入，
    // 避免下游把「JSON 未闭合」误报成响应格式错误、掩盖真实的预算问题
    if (truncated) {
        console.warn(
            '[DeepSeek Truncated] 重试耗尽',
            JSON.stringify({
                finish_reason: finishReason,
                max_tokens: max_tokens ?? DEFAULT_MAX_TOKENS,
                content_length: content.length,
                retry_count: retryCount,
            }),
        )
        throw new Error(
            `DeepSeek 响应被 max_tokens（${max_tokens ?? DEFAULT_MAX_TOKENS}）截断且无法继续扩容，请精简输入或提升上限后重试`,
        )
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
