/**
 * AI 调用核心模块：封装 DeepSeek 对话补全、用量落库与 JSON 容错解析。
 * 复用约定：统一经 fetch 调用 chat/completions，默认模型取环境变量 DEEPSEEK_MODEL（可经
 * options.model 按调用覆盖以切换档位），超时由 AbortSignal 控制；用量经 logAiUsage 异步落库
 * 辅助计费分析，业务侧 JSON 解析统一走 safeJsonParse 容错 AI 常见的不稳定输出。
 * 关键约束：空响应、JSON 模式下的 max_tokens 截断、以及输出语法非法或结构不符预期均属可自愈
 * 故障，须指数退避重试（截断扩容后附精简输出提示，其余附纠偏提示）；重试耗尽时抛出明确错误，
 * 绝不返回不可用 JSON 误导调用方；JSON 调用方可经 validateJson 声明所需结构。
 * 整条重试链共用总时长预算，单次超时取「配置值」与「剩余预算」的较小值，避免多次长超时叠加；
 * 截断扩容次数受限（输出过长时提高 max_tokens 无效，须靠精简约束收敛长度）。
 */
import type { TaskGrade } from '@shared/types'

const DEEPSEEK_BASE_URL =
    process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY

/** max_tokens 扩容上限，超过该值请求会被服务端拒绝 */
const MAX_TOKENS_CEILING = 32000
/**
 * 截断后允许的扩容次数上限：实测输出长度并不随 max_tokens 线性增长（网关可能把推理 token
 * 计入同一预算），无脑扩容只会徒劳耗尽重试次数与总时长预算，故仅首次截断扩容一次，
 * 其后改为携带「精简输出」约束重试
 */
const MAX_TRUNCATION_GROWTH = 1
/** 未显式指定 max_tokens 时的扩容基准值 */
const DEFAULT_MAX_TOKENS = 8000
/** 默认模型档位：可用 DEEPSEEK_MODEL 覆盖，便于切换模型而无需改代码 */
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash'
/** 单次请求的默认超时（未显式配置 timeoutMs 时生效） */
const DEFAULT_ATTEMPT_TIMEOUT_MS = 30_000
/** 含重试在内的整条调用链总时长预算，超出即停止重试，避免用户长时间等待后仍拿不到结果 */
const TOTAL_BUDGET_MS = 120_000
/** 剩余预算低于该值时不值得再发起一次请求 */
const MIN_ATTEMPT_BUDGET_MS = 5_000

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
    /** 本次调用使用的模型档位，未指定时使用默认模型（环境变量 DEEPSEEK_MODEL） */
    model?: string
    temperature?: number
    max_tokens?: number
    response_format?: { type: 'json_object' }
    signal?: AbortSignal
    /** 单次请求超时，实际取该值与整条重试链剩余预算的较小值 */
    timeoutMs?: number
    /**
     * JSON 模式下的结构校验：返回 null 表示通过，返回字符串表示不合格原因。
     * 不合格会触发重试（附纠偏提示），确保 core 只把结构可用的 JSON 交给调用方。
     */
    validateJson?: (parsed: unknown) => string | null
}

interface CallDeepSeekResult {
    content: string
    usage?: DeepSeekUsage
}

interface JsonParseOutcome {
    ok: boolean
    value?: unknown
}

/** 截断重试的过程状态：控制扩容次数上限，并避免重复附加同一份精简提示导致提示词膨胀 */
interface TruncationState {
    /** 已执行的扩容次数，达到 MAX_TRUNCATION_GROWTH 后不再靠扩容碰运气 */
    growCount: number
    /** 精简提示是否已附加过 */
    hintAttached: boolean
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
    deadlineAt?: number,
    truncationState?: TruncationState,
): Promise<CallDeepSeekResult> {
    const MAX_RETRIES = 3
    // 整条重试链共享同一个截止时间：首次调用时确定、重试时透传，
    // 避免「单次超时 × 重试次数」叠加成用户难以等待的时长
    const deadline = deadlineAt ?? Date.now() + TOTAL_BUDGET_MS

    if (!DEEPSEEK_API_KEY) {
        throw new Error('DEEPSEEK_API_KEY 未配置，无法调用 DeepSeek API')
    }

    const {
        messages,
        model,
        temperature,
        max_tokens,
        response_format,
        signal,
        timeoutMs,
        validateJson,
    } = options
    // 截断重试状态仅在链内传递，缺省视为尚未扩容过
    const truncation = truncationState ?? { growCount: 0, hintAttached: false }

    const remainingBudget = deadline - Date.now()
    if (remainingBudget < MIN_ATTEMPT_BUDGET_MS) {
        throw new Error(
            `DeepSeek 调用已超出总时长预算（${TOTAL_BUDGET_MS}ms），放弃请求`,
        )
    }
    // 单次超时取「配置值」与「剩余预算」的较小值，确保单次请求不越过整条链的总预算
    const attemptTimeout = Math.min(
        timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS,
        remainingBudget,
    )

    let data: DeepSeekResponse
    try {
        const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            },
            signal: signal ?? AbortSignal.timeout(attemptTimeout),
            body: JSON.stringify({
                model: model ?? DEEPSEEK_MODEL,
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

        data = (await response.json()) as DeepSeekResponse
    } catch (err) {
        // AbortSignal.timeout 触发的中断转成可读中文错误，与网络错误区分便于排查
        if (err instanceof Error && err.name === 'TimeoutError') {
            throw new Error(
                `DeepSeek 请求超时（单次上限 ${attemptTimeout}ms，总预算 ${TOTAL_BUDGET_MS}ms）`,
            )
        }
        throw err
    }

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
    // 「是否按 JSON 处理响应」与「是否向 API 声明 json_object 模式」解耦：调用方只声明
    // validateJson 时同样启用 JSON 校验与重试（部分网关对 response_format 处理异常，
    // 会把参数值混入模型输出，此时调用方可选择不发送该参数）
    const expectsJson =
        Boolean(validateJson) || response_format?.type === 'json_object'
    const truncated = finishReason === 'length' && expectsJson
    // JSON 模式下模型偶发输出退化（回显请求参数、字段顺序错乱、夹杂无关文本）会产出语法非法的
    // 内容；即使语法合法，结构也可能不符合调用方约定，两者都不能交给调用方使用
    const jsonOutcome: JsonParseOutcome =
        expectsJson && content ? parseJsonLoose(content) : { ok: false }
    const syntaxError =
        expectsJson && !!content && !truncated && !jsonOutcome.ok
    const schemaError =
        expectsJson && !!content && !truncated && jsonOutcome.ok && validateJson
            ? validateJson(jsonOutcome.value)
            : null
    const unusableJson = syntaxError || !!schemaError
    const nextMaxTokens = growMaxTokens(max_tokens)
    // 仅在尚未用满扩容次数且仍有空间时才扩容，避免多轮徒劳扩容拖垮总时长预算
    const canStillGrow =
        truncation.growCount < MAX_TRUNCATION_GROWTH
        && nextMaxTokens > (max_tokens ?? DEFAULT_MAX_TOKENS)

    // 三类可自愈故障统一重试：空响应（服务端抖动）、JSON 截断（输出过长）、JSON 不可用（语法非法/结构不符）；
    // 重试过程只打简洁日志，成功路径不刷屏；仅重试耗尽（最终失败）才打印完整诊断信息辅助排查
    // 预算不足时不再重试：宁可尽快失败，也不让用户等到必然超时
    const hasBudgetForRetry = deadline - Date.now() >= MIN_ATTEMPT_BUDGET_MS
    if (
        finishReason !== 'content_filter'
        && retryCount < MAX_RETRIES
        && hasBudgetForRetry
        && (!content || truncated || unusableJson)
    ) {
        // 指数退避（1s/2s/4s），比线性退避更贴合服务端偶发故障的恢复曲线
        const delay = 1000 * 2 ** retryCount
        // 三类故障用不同前缀，便于日志区分
        let logTag = '[DeepSeek Empty Response]'
        let reasonHint = ''
        if (truncated) {
            logTag = '[DeepSeek Truncated]'
            reasonHint = canStillGrow
                ? `，输出被中途截断，由 ${max_tokens ?? DEFAULT_MAX_TOKENS} 扩容至 ${nextMaxTokens} 并要求精简后重试`
                : '，输出被中途截断，已无扩容空间，改为要求精简后重试'
        } else if (syntaxError) {
            logTag = '[DeepSeek Invalid JSON]'
            reasonHint = '，响应不是合法 JSON，附纠偏提示重新请求'
        } else if (schemaError) {
            logTag = '[DeepSeek Schema Mismatch]'
            reasonHint = `，响应结构不符（${schemaError}），附纠偏提示重新请求`
        }
        // 打出 usage 与片段辅助定位退化形态：截断的关键信息在尾部（断在哪个字段），
        // completion_tokens 与 max_tokens 的差距可直接区分「真撞上限」与「上游异常中断」
        console.warn(
            `${logTag} 重试 ${retryCount + 1}/${MAX_RETRIES}（等待 ${delay}ms）${reasonHint}`,
            JSON.stringify({
                model: model ?? DEEPSEEK_MODEL,
                max_tokens: max_tokens ?? DEFAULT_MAX_TOKENS,
                finish_reason: finishReason,
                prompt_tokens: data.usage?.prompt_tokens ?? null,
                completion_tokens: data.usage?.completion_tokens ?? null,
                content_length: content?.length ?? 0,
                content_head: content?.slice(0, 200) ?? '',
                content_tail: content?.slice(-160) ?? '',
                schema_error: schemaError,
            }),
        )
        await new Promise((r) => setTimeout(r, delay))
        let nextOptions: CallDeepSeekOptions = options
        let nextTruncation = truncation
        if (truncated) {
            // 扩容解决不了「输出天然过长」，真正的解法是让模型缩短输出：
            // 首轮先扩容一次并附加精简约束，其后不再扩容，只靠精简约束重试
            if (canStillGrow) {
                nextOptions = { ...options, max_tokens: nextMaxTokens }
            }
            nextTruncation = {
                growCount: canStillGrow ? truncation.growCount + 1 : truncation.growCount,
                hintAttached: truncation.hintAttached,
            }
            if (!truncation.hintAttached) {
                nextOptions = {
                    ...nextOptions,
                    messages: [
                        ...nextOptions.messages,
                        { role: 'user', content: buildTruncationHint() },
                    ],
                }
                nextTruncation = { ...nextTruncation, hintAttached: true }
            }
        } else if (unusableJson && content) {
            // JSON 不可用则回传上次输出并附纠偏提示，比原参数盲重试更容易把模型纠回正轨
            nextOptions = {
                ...nextOptions,
                messages: [
                    ...nextOptions.messages,
                    { role: 'assistant', content: content.slice(0, 1200) },
                    {
                        role: 'user',
                        content: buildJsonCorrectionHint(syntaxError, schemaError),
                    },
                ],
            }
        }
        return callDeepSeek(nextOptions, retryCount + 1, deadline, nextTruncation)
    }

    if (!content) {
        // 最终失败：记录完整诊断信息
        const diagnostic = {
            finish_reason: finishReason,
            has_choices: !!data.choices,
            choices_length: data.choices?.length ?? 0,
            response_keys: Object.keys(data),
            model: model ?? DEEPSEEK_MODEL,
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

    // 截断且重试耗尽：残缺 JSON 对调用方毫无价值，直接失败并说明已做过的精简重试，
    // 避免下游把「JSON 未闭合」误报成响应格式错误、掩盖真实的预算问题
    if (truncated) {
        console.warn(
            '[DeepSeek Truncated] 重试耗尽',
            JSON.stringify({
                finish_reason: finishReason,
                model: model ?? DEEPSEEK_MODEL,
                max_tokens: max_tokens ?? DEFAULT_MAX_TOKENS,
                prompt_tokens: data.usage?.prompt_tokens ?? null,
                completion_tokens: data.usage?.completion_tokens ?? null,
                content_length: content.length,
                grow_count: truncation.growCount,
                retry_count: retryCount,
                content_tail: content.slice(-160),
            }),
        )
        throw new Error(
            `DeepSeek 响应被中途截断且已精简重试 ${retryCount} 次仍未完整，请稍后重试或缩短内容后重试`,
        )
    }

    // 输出不可用（语法非法或结构不符）且重试仍失败：保留头部片段与失败原因辅助排查，
    // 并抛出可辨识的错误，避免下游把「模型输出错乱」误报为响应格式错误
    if (unusableJson) {
        console.warn(
            '[DeepSeek Invalid JSON] 重试耗尽',
            JSON.stringify({
                finish_reason: finishReason,
                syntax_error: syntaxError,
                schema_error: schemaError,
                content_length: content.length,
                retry_count: retryCount,
                content_head: content.slice(0, 200),
            }),
        )
        const failureReason = syntaxError
            ? '不是合法 JSON'
            : `结构不符：${schemaError}`
        throw new Error(
            `DeepSeek 响应不可用（${failureReason}，已重试 ${retryCount} 次），请稍后重试`,
        )
    }

    return { content, usage: data.usage }
}

/**
 * 宽松解析响应文本：先原文直解，再按围栏/裸控制字符容错解析，口径与 safeJsonParse 一致。
 * 仅供 core 内部的重试判定与结构校验使用，失败时不打印日志，避免与 safeJsonParse 重复刷屏。
 */
function parseJsonLoose(text: string): JsonParseOutcome {
    const candidates = [text, escapeBareControlChars(extractJsonBody(text))]
    for (const candidate of candidates) {
        try {
            return { ok: true, value: JSON.parse(candidate) }
        } catch {
            // 该候选不可解析，继续尝试下一个
        }
    }
    return { ok: false }
}

/** 构造 JSON 输出纠偏提示：说明上次输出的问题，引导模型严格按模板重出，而非原参数盲重试 */
function buildJsonCorrectionHint(
    syntaxError: boolean,
    schemaError: string | null,
): string {
    if (syntaxError) {
        return '你上一次的回复不是合法的 JSON 对象（可能夹杂了额外文字或括号结构错乱）。请只输出一个 JSON 对象，不要输出任何解释、代码块或额外内容。'
    }
    return `你上一次的回复缺少必需字段或字段类型不符：${schemaError ?? '结构不符合要求'}。请严格按照要求的 JSON 结构重新输出，且只输出 JSON。`
}

/** 构造截断纠偏提示：直接给出各字段字数与条目上限，比单纯提高 max_tokens 更能压缩输出长度 */
function buildTruncationHint(): string {
    return '你上一次的回复过长被中途截断，JSON 不完整而无法使用。请大幅精简后重新输出：只输出一个 JSON 对象，不要输出解释或 Markdown 代码块；评语类字段不超过 40 字；每个数组最多 2 条且每条不超过 30 字；没有内容可写的字段直接给空数组或空字符串。'
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
