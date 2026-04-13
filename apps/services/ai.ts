import {
    taskTypeLabels,
    taskClassLabels,
    defaultGradeValues,
    taskTypeDefaultTitles,
} from '@apps/lib/utils'
import type { TaskType, TaskGrade } from '@apps/lib/types'

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
    type: 'composition' | 'mindmap',
    grade: number,
): Promise<string> {
    const defaultTitle = {
        mindmap: '围绕成长的思维导图',
        composition: '记一件有意义的事',
    }

    const prompt = {
        mindmap: `请为${taskClassLabels[grade]}学生出一道独特的思维导图题目。要求：
1. 主题必须从以下10个类别中随机选择一个独特的切入点（每次必须选择不同类别，避免重复）：
   - 阅读感悟：书中的故事、阅读启示、人物分析、情节联想
   - 自然观察：季节变化、天气现象、动植物世界、环境保护
   - 科学探索：物理现象、化学实验、科技应用、天文知识
   - 社会生活：家庭温馨、校园故事、社区活动、人际交往
   - 文化体验：传统节日、民俗技艺、诗词歌赋、民间故事
   - 成长感悟：克服困难、学习新技能、友谊故事、自我认识
   - 艺术创作：绘画手工、音乐舞蹈、戏剧表演、创意设计
   - 身心健康：运动健身、心理健康、饮食习惯、作息规律
   - 未来想象：职业梦想、科创幻想、社会变化、环球旅行
   - 跨学科融合：数学在生活中、历史故事与现实、诗词中的科学
2. 题目要新颖独特，避免泛泛而谈，角度要具体化
3. 只返回题目文本，不要加引号或其他符号`,

        composition: `请为${taskClassLabels[grade]}学生出一道有创意的作文题目。要求：
1. 题目类型从以下形式中随机选择：命题作文、半命题作文、材料作文（需附50字以内的材料/情境）
2. 主题必须从以下领域中随机选择一个独特角度：校园生活、家庭温情、自然观察、成长故事、奇思妙想、社会见闻、读书感悟、人物描写、艺术欣赏、科技探索
3. 避免老套的题目（如"难忘的一件事"、"我的妈妈"等），确保题目有新鲜感
4. 只返回题目文本，不要加引号或其他符号`,
    }

    if (!DEEPSEEK_API_KEY) {
        return `${taskClassLabels[grade]}${taskTypeLabels[type]}：${defaultTitle[type]}`
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

        let generatedTitle = rawContent
            .trim()
            // 移除常见的中英文引号
            .replace(/^["'"「」『』]|[ "'"「」『』]$/gu, '')

        await logAiUsage('ai-task', data.usage, generatedTitle)

        return generatedTitle
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI generate title error:', message)
        return `${taskClassLabels[grade]}${taskTypeLabels[type]}：${defaultTitle[type]}`
    }
}

export async function generateTitle(
    content: string,
    type: 'composition' | 'mindmap' = 'composition',
    taskId?: number,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return taskTypeDefaultTitles[type]
    }

    const prompt: string = `请根据以下${taskTypeLabels[type]}内容，生成一个简洁恰当的标题（不超过15个字，只返回标题文本，不要加引号或其他符号）：\n\n${content.slice(0, 2000)}`

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

        const generatedTitle = rawContent
            .trim()
            // 移除常见的中英文引号
            .replace(/^["'"「」『』]|[ "'"「」『』]$/gu, '')

        await logAiUsage('ai-title', data.usage, generatedTitle, taskId)

        return generatedTitle
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

    const prompt: string = title
        ? `请对以下${taskTypeLabels[type]}进行评分。题目：${title}\n\n内容：\n${content}\n\n请按以下格式返回：\n1. 评分等级（A+/A/B/C/D/E，E为未完成）\n2. 百分制分数\n3. 评语（50字以内）\n4. 改进建议（1-3条）\n\n请严格按以下 JSON 格式返回：\n{"grade":"等级","score":分数,"comment":"评语","suggestions":["建议1","建议2"]}`
        : `请对以下${taskTypeLabels[type]}进行评分，无指定题目，请根据内容评判。\n\n内容：\n${content}\n\n请按以下格式返回：\n1. 评分等级（A+/A/B/C/D/E，E为未完成）\n2. 百分制分数\n3. 评语（50字以内）\n4. 改进建议（1-3条）\n\n请严格按以下 JSON 格式返回：\n{"grade":"等级","score":分数,"comment":"评语","suggestions":["建议1","建议2"]}`

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
