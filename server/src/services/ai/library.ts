/**
 * 题库 AI 服务模块：根据单道小题的题干生成「解题思路」，只给方法与引导问题，不给答案。
 * 复用约定：AI 调用统一走 callDeepSeek（内置退避重试与总时长预算），用量经 logAiUsage 落库，
 * 提示词模板取 @shared/constants 的 defaultPromptLibraryHint。
 * 关键约束：传入的必须是已剔除「参考答案」的题干段；输出若出现结论式答案须附强约束重试一次，
 * 二次仍泄露时保留结果而不是报错（宁可有思路也不让用户空手）；内部错误详情不得透传给前端。
 */
import {
    defaultPromptLibraryHint,
    promptLibraryHintRegenerate,
} from '@shared/constants'

import { callDeepSeek, DEEPSEEK_API_KEY, logAiUsage } from './core'

/** 单题题干送 AI 的长度上限：整卷降级为单块时题干可能很长，截断以控制 token 与超时 */
const MAX_QUESTION_LENGTH = 2000
/** 常规生成预算：五个小节实测约 1500~2500 tokens，4000 留出余量（推理 token 也占该预算） */
const HINT_MAX_TOKENS = 4000
/** 被截断后的扩容上限：中文输出偏长时靠更大预算一次说完 */
const HINT_RETRY_MAX_TOKENS = 8000

/** 结论式答案的特征句：命中即视为泄露答案，追加约束提示重写一次 */
const ANSWER_LEAK_PATTERNS: RegExp[] = [
    /正确答案(是|为)/,
    /答案(是|为)[:：]/,
    /(所以|因此)(等于|结果|答案为)/,
    /最终(答案|结果)(是|为|等于)/,
    /应该(选|选择)[A-D]/,
]

function hasAnswerLeak(text: string): boolean {
    return ANSWER_LEAK_PATTERNS.some((pattern) => pattern.test(text))
}

/** 去掉模型偶发的整体代码围栏包裹，避免前端把它渲染成代码块 */
function stripOuterFence(text: string): string {
    const trimmed = text.trim()
    const matched = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/.exec(trimmed)
    return matched ? matched[1].trim() : trimmed
}

/**
 * 清洗模型输出：结果会写回题目文件并由 Markdown 预览以 rehype-raw 渲染，
 * 故须去掉原始 HTML 标签与注释——既防注入，也防模型伪造 `<!-- hint:N -->` 破坏思路区结构。
 * 只删除形如 `<tag …>` 的片段，公式中的小于号后接数字或空格时不受影响。
 */
function sanitizeHintMarkdown(text: string): string {
    return text
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * 生成单题解题思路。
 * @param question 已剥离答案段的小题题干（Markdown 原文）
 * @param title 题目来源标题，仅用于用量日志归类
 * @param isRegenerate 是否「换一种思路」：命中时提高随机性并要求换角度，不参与缓存
 */
export async function generateLibraryHint(
    question: string,
    title: string,
    isRegenerate: boolean,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('AI 解题思路未配置，请设置 DEEPSEEK_API_KEY')
    }

    const prompt =
        defaultPromptLibraryHint.replace(
            '{question}',
            question.slice(0, MAX_QUESTION_LENGTH),
        ) + (isRegenerate ? promptLibraryHintRegenerate : '')

    const first = await callDeepSeek({
        messages: [{ role: 'user', content: prompt }],
        // 重生成时提高温度换取不同切入角度；常规生成偏低以保证结构稳定
        temperature: isRegenerate ? 0.9 : 0.4,
        max_tokens: HINT_MAX_TOKENS,
        // 单题思路含五个小节，正常 40s 内完成；留足余量避免被默认 30s 掐断
        timeoutMs: 90_000,
    })

    await logAiUsage('library-hint', first.usage, `题目思路：${title}`)

    let raw = stripOuterFence(first.content)
    // 纯文本调用的截断不会在 core 内自动重试（截断内容仍可用），此处扩容重试一次并明确收敛篇幅，
    // 避免思路停在小节中间（曾出现停在「四、易错提醒」的情况）
    if (first.finishReason === 'length') {
        const retried = await callDeepSeek({
            messages: [
                {
                    role: 'user',
                    content: `${prompt}\n\n补充要求：上一次回复因过长被截断。请必须完整输出五个小节，每节 2~4 条、每条不超过 40 字，不许省略任何小节，宁可简洁也不要中途停住。`,
                },
            ],
            temperature: 0.3,
            max_tokens: HINT_RETRY_MAX_TOKENS,
            timeoutMs: 90_000,
        })
        await logAiUsage('library-hint', retried.usage, `题目思路扩容重写：${title}`)
        raw = stripOuterFence(retried.content)
    }

    const hint = sanitizeHintMarkdown(raw)
    if (!hasAnswerLeak(hint)) return hint

    // 命中泄露：回传上次输出并附强约束重写一次，不做无限重试以免叠加计费与等待
    const corrected = await callDeepSeek({
        messages: [
            { role: 'user', content: prompt },
            { role: 'assistant', content: hint.slice(0, 1200) },
            {
                role: 'user',
                content:
                    '你上一次的回复里出现了结论式的答案，这是不允许的。请重写：删掉所有"答案是""所以等于""应该选"之类的句子以及任何具体结果数值，只保留方法、引导问题和易错提醒。',
            },
        ],
        temperature: 0.3,
        max_tokens: 1600,
        timeoutMs: 90_000,
    })

    await logAiUsage('library-hint', corrected.usage, `题目思路重写：${title}`)

    return sanitizeHintMarkdown(stripOuterFence(corrected.content))
}
