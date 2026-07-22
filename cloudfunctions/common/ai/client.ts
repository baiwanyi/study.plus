import cloudbase from '@cloudbase/node-sdk'
import { ENV_ID } from '../config'
import { insertAndGetId, query } from '../db'
import { HttpError } from '../errors'

const APP = cloudbase.init({ env: ENV_ID })
const MODEL = APP.ai().createModel('deepseek')

/** 单用户每日 AI 调用上限，防止脚本刷爆账单（高成本接口配额控制） */
const DAILY_AI_CALL_CAP = 200

export interface AiMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
}

export interface AiUsage {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
}

export interface CallAiOptions {
    messages: AiMessage[]
    temperature?: number
    maxTokens?: number
    responseFormat?: { type: 'json_object' }
    timeoutMs?: number
    /** 配额主体：传入后执行单用户每日调用上限校验，防止账单刷爆 */
    quotaUserId?: number
}

export interface CallAiResult {
    content: string
    usage?: AiUsage
}

interface CloudBaseAiResponse {
    data?: {
        choices?: Array<{ message?: { content?: string } }>
        usage?: AiUsage
    }
    choices?: Array<{ message?: { content?: string } }>
    usage?: AiUsage
}

/** 单用户当日 AI 调用次数配额校验；超限抛出 429 */
async function assertWithinDailyQuota(userId: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10)
    const rows = await query<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ai_usage_logs
         WHERE user_id = ? AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [userId, today, today],
    )
    const used = rows[0]?.count ?? 0
    if (used >= DAILY_AI_CALL_CAP) {
        throw new HttpError(429, '今日 AI 调用已达上限，请明日再试')
    }
}

function extractContent(resp: unknown): CallAiResult {
    const r = resp as CloudBaseAiResponse
    const data = r?.data ?? r
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
        throw new Error('AI 返回内容为空（可能被过滤或截断）')
    }
    return { content, usage: data?.usage }
}

/**
 * 调用 CloudBase AI（deepseek）。
 * 统一封装重试、用量记录入口；任何第三方 Key 均不出现在此处（由平台托管）。
 */
export async function callAi(options: CallAiOptions): Promise<CallAiResult> {
    const {
        messages,
        temperature,
        maxTokens,
        responseFormat,
        quotaUserId,
    } = options

    if (quotaUserId != null) {
        await assertWithinDailyQuota(quotaUserId)
    }

    const res = await MODEL.generateText({
        model: 'deepseek-v4-flash',
        messages,
        temperature: temperature ?? 0.7,
        ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        ...(responseFormat ? { response_format: responseFormat } : {}),
    })

    return extractContent(res)
}

/** 记录 AI 调用用量（脱敏 taskTitle，仅保留前 16 字） */
export async function logAiUsage(
    project: string,
    usage: AiUsage | undefined,
    context: {
        userId?: number
        taskTitle?: string
        taskId?: number
    } = {},
): Promise<void> {
    if (!usage) return
    try {
        const title = context.taskTitle
        const truncated =
            title && title.length > 16 ? `${title.slice(0, 16)}...` : title
        await insertAndGetId(
            `INSERT INTO ai_usage_logs
       (user_id, project, task_id, task_title, prompt_tokens, completion_tokens, total_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                context.userId ?? null,
                project,
                context.taskId ?? null,
                truncated ?? null,
                usage.prompt_tokens ?? 0,
                usage.completion_tokens ?? 0,
                usage.total_tokens ?? 0,
            ],
        )
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[AI Usage Log Failed]', msg)
    }
}

export function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T
    } catch {
        return fallback
    }
}
