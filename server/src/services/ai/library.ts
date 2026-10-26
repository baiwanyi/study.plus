/**
 * 题库 AI 服务模块：单题的「解题思路」生成与整卷「AI 出卷」。
 * 复用约定：AI 调用统一走 callDeepSeek（内置退避重试与总时长预算），用量经 logAiUsage 落库，
 * 提示词模板取 @shared/constants 的 defaultPromptLibraryHint / promptLibraryGeneratePaper。
 * 关键约束：解题思路的入参必须是已剔除「参考答案」的题干段，输出若出现结论式答案须重试一次；
 * 整卷结果要落盘成题目文件，故须补齐标题与「做题要求」「做题建议」两段、统一题项间空行、
 * 缺失答案段时单独补写，并用 @shared/utils 的解析器验证题目可被识别后才返回；
 * 内部错误详情不得透传给前端。
 */
import {
    defaultPromptLibraryHint,
    promptLibraryGenerateAnswerOnly,
    promptLibraryGeneratePaper,
    promptLibraryHintRegenerate,
} from '@shared/constants'
import {
    flattenLibraryInstructionSections,
    parseLibraryQuestions,
    splitLibraryAnswer,
} from '@shared/utils'

import {
    callDeepSeek,
    DEEPSEEK_API_KEY,
    DEEPSEEK_VISION_MODEL,
    logAiUsage,
} from './core'
import type { DeepSeekContentPart, DeepSeekMessage } from './core'

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

/** 整卷正文长度上限：题库单文件上限 1MB，此处按字符数留足余量并拦截异常超长输出 */
const PAPER_MAX_CHARS = 200_000
/** 常规出卷预算：整卷题面 + 答案实测约 3000~5000 tokens */
const PAPER_MAX_TOKENS = 8000
/** 被截断后的扩容上限：宁可多给预算也不要让答案段被砍掉 */
const PAPER_RETRY_MAX_TOKENS = 16_000
/** 补写答案段的预算：只出答案，用量远小于整卷 */
const ANSWER_MAX_TOKENS = 4000
/** 补答案时随提示词回传的题面长度上限，避免重复送整卷 */
const ANSWER_PROMPT_PAPER_LIMIT = 8000

/** 出卷参数：由路由层做过范围校验，本层只负责拼提示词与清洗结果；标题由模型自拟 */
export interface LibraryPaperOptions {
    grade: string
    subject: string
    requirements: string
    questionCount: number
    /** 题目要求附带的参考图片（data URL），为空则走纯文本出题 */
    images?: string[]
}

/** 一级标题、做题要求、做题建议与答案段的检测式，与题库解析器的行首规则保持一致 */
const PAPER_HEADING_LINE = /^#[ \t]+\S.*$/m
const PAPER_REQUIREMENT_SECTION = /\*\*做题要求[：:]?\*\*/
const PAPER_SUGGESTION_SECTION = /\*\*做题建议[：:]?\*\*/
const PAPER_ANSWER_HEADING = /^#{1,6}[ \t]+.*参考答案/m
const PAPER_DIVIDER_LINE = /^[ \t]*-{3,}[ \t]*$/m
/** 需要与下一行空行隔开的行：题号项、无序列表项、独立加粗段落 */
const PAPER_ITEM_LINE =
    /^[ \t]{0,3}(?:\d{1,3}[.、．)）][ \t]+\S|[-*+][ \t]+\S|\*\*[^*\n]+\*\*[：:]?[ \t]*$)/

/** 模型漏写「做题要求」时的兜底段落：通用但可执行的作答规范，用 `-` 避免被当成小题 */
const DEFAULT_REQUIREMENTS_SECTION =
    '**做题要求：**\n' +
    '\n' +
    '- **先圈关键词**：读题时圈出已知条件与所求问题，明确每一步要算什么。\n' +
    '\n' +
    '- **写明关系式**：先写出数量关系式，再代入数据计算。\n' +
    '\n' +
    '- **检查结果**：算完核对单位是否统一、结果是否符合题意。'

/** 模型漏写「做题建议」时的兜底段落 */
const DEFAULT_SUGGESTIONS_SECTION =
    '**做题建议**：\n' +
    '\n' +
    '- **画图辅助**：遇到分率、倍数、行程类问题时，先画线段图或示意图理清关系。\n' +
    '\n' +
    '- **分步作答**：多步问题拆成小问，写出中间结果，避免一步跳错。'

/**
 * 清洗模型输出：去掉 CR、HTML 注释与标签（防注入）、代码围栏标记行，并压缩多余空行。
 * 不删除 `\\( … \\)` 定界符——公式里的反斜杠不受 HTML 标签正则影响。
 */
function sanitizePaperMarkdown(text: string): string {
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '')
        .replace(/^[ \t]*(?:`{3,}|~{3,})[^\n]*$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
}

/**
 * 统一空行排版：题号项、列表项与独立加粗段落之后补一个空行，
 * 保证每道题、每条要求建议之间都有空行（题库排版约定），最后压缩连续空行。
 */
export function normalizePaperSpacing(markdown: string): string {
    const lines = markdown.split('\n')
    const result: string[] = []
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        result.push(line)
        const next = lines[index + 1]
        if (next === undefined || next.trim() === '') continue
        if (!PAPER_ITEM_LINE.test(line)) continue
        result.push('')
    }
    return result.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** 在标题行之后插入段落，标题缺失时整体前置 */
function insertAfterHeading(body: string, block: string): string {
    const heading = PAPER_HEADING_LINE.exec(body)
    if (!heading) return `${block}\n\n${body}`
    const cut = heading.index + heading[0].length
    return `${body.slice(0, cut)}\n\n${block}${body.slice(cut)}`
}

/** 在「做题要求」段的分隔线之后插入段落；找不到分隔线时追加到文末 */
function insertAfterRequirements(body: string, block: string): string {
    const info = PAPER_REQUIREMENT_SECTION.exec(body)
    if (!info) return insertAfterHeading(body, block)
    const rest = body.slice(info.index)
    const divider = PAPER_DIVIDER_LINE.exec(rest)
    if (!divider) return `${body.trimEnd()}\n\n---\n\n${block}`
    const cut = info.index + divider.index + divider[0].length
    return `${body.slice(0, cut)}\n\n${block}${body.slice(cut)}`
}

/** 用量日志里的题目标识：学科优先，要求文本作区分 */
function paperLogLabel(options: LibraryPaperOptions): string {
    const subject = options.subject.trim() || '未指定学科'
    return options.requirements.trim()
        ? `${subject}：${options.requirements.trim().slice(0, 16)}`
        : subject
}

/** 模型漏写一级标题时的兜底标题：年级 + 学科，空字段自动跳过 */
function buildFallbackTitle(options: LibraryPaperOptions): string {
    const parts = [options.grade, options.subject]
        .map((part) => part.trim())
        .filter((part) => part !== '')
    return parts.length > 0 ? `${parts.join('·')}练习` : '练习题'
}

/**
 * 组装出卷消息：有参考图片时改用多模态分片（文本 → 图片 → 收尾说明），
 * 让模型先识别图片里的知识点、题型与数据再出题；纯文本时仍是单条字符串。
 */
function buildPaperMessages(
    prompt: string,
    images: string[] | undefined,
): DeepSeekMessage[] {
    if (!images || images.length === 0) {
        return [{ role: 'user', content: prompt }]
    }
    const parts: DeepSeekContentPart[] = [
        { type: 'text', text: prompt },
        ...images.map<DeepSeekContentPart>((url) => ({
            type: 'image_url',
            image_url: { url },
        })),
        {
            type: 'text',
            text:
                '以上图片是老师提供的题目要求、教材页面或样题。请先识别图片中的知识点、题型、数据与答题要求，' +
                '再按上面的格式出题；图片与文字要求冲突时以图片内容为准，图片中看不清的内容不要臆造。',
        },
    ]
    return [{ role: 'user', content: parts }]
}

/**
 * 补齐固定结构：标题行必须居首（模型常在前面写套话），
 * 「做题要求」与「做题建议」两段缺失时用兜底段落补在标题之后/要求段之后，
 * 最后把两段里的数字编号压成无序列表，避免被解析成小题。
 */
export function ensurePaperStructure(
    markdown: string,
    options: LibraryPaperOptions,
): string {
    let body = markdown
    const heading = PAPER_HEADING_LINE.exec(body)
    if (!heading) {
        body = `# ${buildFallbackTitle(options)}\n\n${body}`
    } else if (heading.index > 0) {
        body = body.slice(heading.index)
    }
    if (!PAPER_REQUIREMENT_SECTION.test(body)) {
        body = insertAfterHeading(body, DEFAULT_REQUIREMENTS_SECTION)
    }
    if (!PAPER_SUGGESTION_SECTION.test(body)) {
        body = insertAfterRequirements(body, DEFAULT_SUGGESTIONS_SECTION)
    }
    return flattenLibraryInstructionSections(body)
}

/** 题目必须能被共享解析器切出至少一道小题，否则前端只当整段文字渲染，失去逐题与思路入口 */
function assertPaperParsable(paper: string): void {
    const { question } = splitLibraryAnswer(paper)
    const hasQuestion = parseLibraryQuestions(question).some(
        (block) => block.kind === 'question',
    )
    if (!hasQuestion) {
        throw new Error('AI 生成的试卷格式无法识别，请重试')
    }
}

/** 模型漏写答案段时单独补写一次：只送题面、只收答案，避免整卷重生成带来的额外等待与计费 */
async function appendAnswerSection(
    paper: string,
    options: LibraryPaperOptions,
): Promise<string> {
    const response = await callDeepSeek({
        messages: [
            {
                role: 'user',
                content: promptLibraryGenerateAnswerOnly.replace(
                    '{paper}',
                    paper.slice(0, ANSWER_PROMPT_PAPER_LIMIT),
                ),
            },
        ],
        temperature: 0.2,
        max_tokens: ANSWER_MAX_TOKENS,
        timeoutMs: 120_000,
    })
    await logAiUsage(
        'library-generate',
        response.usage,
        `AI 出卷补答案：${paperLogLabel(options)}`,
    )
    const answers = normalizePaperSpacing(
        sanitizePaperMarkdown(stripOuterFence(response.content)),
    )
    if (!PAPER_ANSWER_HEADING.test(answers)) {
        throw new Error('AI 未能生成参考答案，请重试')
    }
    return `${paper.trimEnd()}\n\n---\n\n${answers}`
}

/**
 * 生成整份试卷的 Markdown 正文。
 * 输出顺序：出卷 → 清洗补结构 → 缺答案补写 → 校验可解析；任一环节不合规都抛错，
 * 由路由层统一转成「请重试」，避免把半成品写入题库目录。
 */
export async function generateLibraryPaper(
    options: LibraryPaperOptions,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        throw new Error('AI 出卷未配置，请设置 DEEPSEEK_API_KEY')
    }

    const images = options.images ?? []
    const hasImages = images.length > 0
    // 纯文本档位不会接收 image_url 分片，缺视觉模型时提前失败并给出可操作提示
    if (hasImages && !DEEPSEEK_VISION_MODEL) {
        throw new Error(
            '图片出题需要配置支持视觉的模型，请设置环境变量 DEEPSEEK_VISION_MODEL',
        )
    }

    const prompt = promptLibraryGeneratePaper
        .replaceAll('{grade}', options.grade)
        .replaceAll('{subject}', options.subject)
        .replaceAll('{questionCount}', String(options.questionCount))
        .replaceAll('{requirements}', options.requirements || '无')
    const model = hasImages ? DEEPSEEK_VISION_MODEL : undefined

    const first = await callDeepSeek({
        messages: buildPaperMessages(prompt, options.images),
        model,
        // 出卷需要一定变化度，过高会让同类题重复率上升
        temperature: 0.6,
        max_tokens: PAPER_MAX_TOKENS,
        // 整卷含答案生成较慢，给足超时余量
        timeoutMs: 120_000,
    })
    await logAiUsage(
        'library-generate',
        first.usage,
        `AI 出卷：${paperLogLabel(options)}`,
    )

    let raw = stripOuterFence(first.content)
    // 截断时答案段通常最先被砍掉，扩容重试并要求压缩题干、不得减少题量
    if (first.finishReason === 'length') {
        const retried = await callDeepSeek({
            messages: buildPaperMessages(
                `${prompt}\n\n补充要求：上一次回复因过长被截断。请压缩题干篇幅，保证题面与参考答案一次写完，题量不得减少。`,
                options.images,
            ),
            model,
            temperature: 0.4,
            max_tokens: PAPER_RETRY_MAX_TOKENS,
            timeoutMs: 120_000,
        })
        await logAiUsage(
            'library-generate',
            retried.usage,
            `AI 出卷扩容重写：${paperLogLabel(options)}`,
        )
        raw = stripOuterFence(retried.content)
    }

    let paper = normalizePaperSpacing(
        ensurePaperStructure(sanitizePaperMarkdown(raw), options),
    )
    if (!PAPER_ANSWER_HEADING.test(paper)) {
        paper = await appendAnswerSection(paper, options)
    }
    if (paper.length > PAPER_MAX_CHARS) {
        throw new Error('AI 生成的试卷过长，请减少题量后重试')
    }
    assertPaperParsable(paper)
    return paper
}
