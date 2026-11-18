/**
 * 看图说话 AI 服务：采集阶段生成中文关键词提示，练习阶段按四个维度评价学生的图片描述。
 * 复用约定：统一复用 callDeepSeek 的多模态分片、JSON 容错解析与纠正重试，用量经 logAiUsage
 * 按 phototalk-* 项目落库；评分结构遵循 @shared/types 的 PictureScoreResult 契约。
 * 关键约束：图片以 data URL 随 image_url 分片发送，评语与数组长度均设上限以防输出截断；
 * 关键词生成失败不阻断图片采集，评分失败必须抛错由路由返回明确错误，禁止返回伪造分数。
 */
import type { PictureScoreDimension, PictureScoreResult } from '@shared/types'
import {
    callDeepSeek,
    DEEPSEEK_VISION_MODEL,
    logAiUsage,
    safeJsonParse,
} from './core'
import type { DeepSeekContentPart } from './core'

const SCORE_DIMENSIONS = [
    { key: 'relevance', label: '切题与完整性', max: 30 },
    { key: 'detail', label: '观察细节与准确性', max: 25 },
    { key: 'language', label: '语言表达与组织', max: 25 },
    { key: 'keywords', label: '关键词覆盖', max: 20 },
] as const

const KEYWORD_SYSTEM_PROMPT = `你是看图说话练习的备课助手。请观察图片，给出 5 到 8 个能提示学生观察画面的中文关键词或短语，覆盖主体、动作、环境与细节。
只输出一个 JSON 对象，格式：{"keywords":["关键词1","关键词2"]}。不要输出解释或 Markdown 代码块。每个关键词不超过 8 个字。`

const SCORE_SYSTEM_PROMPT = `你是看图说话练习的评分老师。请结合图片、关键词提示和学生的描述评分，总分 100 分。
四个维度及满分必须严格遵循：
1. relevance 切题与完整性（30 分）：是否描述主体、场景与核心内容，是否偏离画面。
2. detail 观察细节与准确性（25 分）：是否捕捉动作、表情、环境等细节，是否出现画面中不存在的对象。
3. language 语言表达与组织（25 分）：语句通顺、顺序合理、用词与修辞恰当。
4. keywords 关键词覆盖（20 分）：自然涵盖所给关键词的比例，机械堆砌不计分。
只输出一个 JSON 对象，格式如下，不要输出解释或 Markdown 代码块：
{
  "totalScore": 82,
  "dimensions": [
    {"key":"relevance","label":"切题与完整性","score":26,"max":30,"comment":"评语不超过 40 字"},
    {"key":"detail","label":"观察细节与准确性","score":20,"max":25,"comment":"评语不超过 40 字"},
    {"key":"language","label":"语言表达与组织","score":21,"max":25,"comment":"评语不超过 40 字"},
    {"key":"keywords","label":"关键词覆盖","score":15,"max":20,"comment":"评语不超过 40 字"}
  ],
  "highlights": ["亮点，最多 3 条，每条不超过 40 字"],
  "improvements": ["改进建议，最多 3 条，每条不超过 40 字"],
  "keywordCoverage": {"covered":["已覆盖关键词"],"missed":["未覆盖关键词"]},
  "referenceDescription": "一段 100 字以内的参考描述"
}`

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFiniteNumber(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : null
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function toStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, maxLength))
        .filter((item) => item.length > 0)
        .slice(0, maxItems)
}

interface RawScore {
    totalScore: unknown
    dimensions: unknown
    highlights: unknown
    improvements: unknown
    keywordCoverage: unknown
    referenceDescription: unknown
}

function validateScoreJson(value: unknown): string | null {
    if (!isRecord(value)) return '响应不是 JSON 对象'
    if (toFiniteNumber(value.totalScore) === null) return 'totalScore 不是数字'
    if (!Array.isArray(value.dimensions) || value.dimensions.length !== 4) {
        return 'dimensions 必须包含 4 个维度'
    }
    for (const item of value.dimensions) {
        if (!isRecord(item)) return '维度条目不是对象'
        if (typeof item.key !== 'string') return '维度 key 不是字符串'
        if (toFiniteNumber(item.score) === null) return '维度 score 不是数字'
    }
    if (!Array.isArray(value.highlights) || !Array.isArray(value.improvements)) {
        return 'highlights 与 improvements 必须是数组'
    }
    if (!isRecord(value.keywordCoverage)) {
        return 'keywordCoverage 不是对象'
    }
    if (typeof value.referenceDescription !== 'string') {
        return 'referenceDescription 不是字符串'
    }
    return null
}

/** 二次钳制 AI 输出：分数不超过维度满分，总分以钳制后各维度之和为准并记录差异 */
function normalizeScore(raw: RawScore): PictureScoreResult {
    const sourceDimensions: Record<string, unknown>[] = Array.isArray(raw.dimensions)
        ? raw.dimensions.filter(isRecord)
        : []

    const dimensions: PictureScoreDimension[] = SCORE_DIMENSIONS.map((meta) => {
        const found = sourceDimensions.find(
            (item) => item.key === meta.key,
        )
        const rawScore = found ? toFiniteNumber(found.score) : null
        const score = Math.round(
            clamp(rawScore ?? 0, 0, meta.max),
        )
        const comment =
            typeof found?.comment === 'string'
                ? found.comment.trim().slice(0, 120)
                : ''
        return {
            key: meta.key,
            label: meta.label,
            score,
            max: meta.max,
            comment,
        }
    })

    const totalScore = dimensions.reduce((sum, item) => sum + item.score, 0)
    const declared = toFiniteNumber(raw.totalScore)
    if (declared !== null && Math.round(declared) !== totalScore) {
        console.warn(
            `[PhotoTalk] 评分维度合计与总分不一致：AI 声明 ${declared}，钳制后 ${totalScore}`,
        )
    }

    const coverage = isRecord(raw.keywordCoverage) ? raw.keywordCoverage : {}
    return {
        totalScore,
        dimensions,
        highlights: toStringArray(raw.highlights, 3, 80),
        improvements: toStringArray(raw.improvements, 3, 80),
        keywordCoverage: {
            covered: toStringArray(coverage.covered, 8, 24),
            missed: toStringArray(coverage.missed, 8, 24),
        },
        referenceDescription:
            typeof raw.referenceDescription === 'string'
                ? raw.referenceDescription.trim().slice(0, 800)
                : '',
    }
}

/** 采集阶段生成关键词：失败时回落空数组，由练习页提示「暂无提示」，不影响图片入库 */
export async function generatePictureKeywords(
    imageDataUrl: string,
    sourceDescription: string | null,
): Promise<string[]> {
    const contentParts: DeepSeekContentPart[] = [
        {
            type: 'text',
            text: `${KEYWORD_SYSTEM_PROMPT}\n图片原始描述：${sourceDescription ?? '无'}`,
        },
        { type: 'image_url', image_url: { url: imageDataUrl } },
    ]

    try {
        const { content, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: contentParts }],
            model: DEEPSEEK_VISION_MODEL,
            temperature: 0.5,
            max_tokens: 400,
            response_format: { type: 'json_object' },
            validateJson: (value) => {
                if (!isRecord(value)) return '响应不是 JSON 对象'
                if (!Array.isArray(value.keywords)) return 'keywords 不是数组'
                return null
            },
        })
        await logAiUsage('phototalk-keywords', usage)
        const parsed = safeJsonParse<{ keywords?: unknown }>(content, {})
        return toStringArray(parsed?.keywords, 8, 24)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[PhotoTalk] 关键词生成失败，按无提示继续:', message)
        return []
    }
}

/** 练习阶段评分：结构校验失败由 callDeepSeek 纠正重试，最终失败则抛出明确错误 */
export async function scorePictureDescription(
    imageDataUrl: string,
    keywords: string[],
    description: string,
): Promise<PictureScoreResult> {
    const contentParts: DeepSeekContentPart[] = [
        {
            type: 'text',
            text: `${SCORE_SYSTEM_PROMPT}\n关键词提示：${keywords.join('、') || '无'}\n学生描述：${description}`,
        },
        { type: 'image_url', image_url: { url: imageDataUrl } },
    ]

    const { content, usage } = await callDeepSeek({
        messages: [{ role: 'user', content: contentParts }],
        model: DEEPSEEK_VISION_MODEL,
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        validateJson: validateScoreJson,
    })
    await logAiUsage('phototalk-score', usage)

    const parsed = safeJsonParse<RawScore | null>(content, null)
    if (!parsed) {
        throw new Error('AI 评分结果解析失败，请稍后重试')
    }
    return normalizeScore(parsed)
}
