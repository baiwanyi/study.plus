import {
    taskTypeLabels,
    taskClassLabels,
    defaultGradeValues,
    taskTypeDefaultTitles,
} from '@shared/utils'
import type { TaskType, TaskGrade, WeeklyAnalysis, ChatMessage } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'
import {
    defaultTaskTitle,
    defaultPromptTaskTitleComposition,
    defaultPromptTaskTitleMindmap,
    defaultPromptTaskTitleNotes,
    defaultPromptGenerateTitle,
    defaultPromptScoreComposition,
} from '@shared/constants'

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
        const { db } = await import('../db/index')
        const { aiUsageLogs } = await import('../db/schema')
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
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[AI Usage Log Failed]', msg)
    }
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

async function callDeepSeek(
    options: CallDeepSeekOptions,
): Promise<CallDeepSeekResult> {
    const { messages, temperature, max_tokens, response_format, signal } =
        options

    const response = await fetch(
        `${DEEPSEEK_BASE_URL}/chat/completions`,
        {
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
        },
    )

    if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        throw new Error(
            `DeepSeek API error ${response.status}: ${errorText.slice(0, 200)}`,
        )
    }

    const data = (await response.json()) as DeepSeekResponse
    const content: string | undefined = data.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty response from DeepSeek')

    return { content, usage: data.usage }
}

function safeJsonParse<T>(json: string, fallback: T): T {
    try {
        return JSON.parse(json) as T
    } catch {
        return fallback
    }
}

export async function generateTaskTitle(
    type: TaskType,
    grade: number,
): Promise<string> {
    const gradeLabel = taskClassLabels[grade]
    const typeLabel = taskTypeLabels[type]
    const promptMap: Partial<Record<TaskType, string>> = {
        mindmap: defaultPromptTaskTitleMindmap.replace('{taskGrade}', gradeLabel),
        composition: defaultPromptTaskTitleComposition.replace(
            '{taskGrade}',
            gradeLabel,
        ),
        notes: defaultPromptTaskTitleNotes.replace('{taskGrade}', gradeLabel),
    }

    if (!DEEPSEEK_API_KEY) {
        return `${gradeLabel}${typeLabel}：${defaultTaskTitle[type]}`
    }

    const userPrompt = promptMap[type] ?? `请为${gradeLabel}学生出一道${typeLabel}题目，要求新颖有趣。只返回题目文本。`

    try {
        const { content, usage } = await callDeepSeek({
            messages: [
                { role: 'user', content: userPrompt } as DeepSeekMessage,
            ],
            temperature: 0.8,
            max_tokens: 60,
        })

        await logAiUsage('ai-task', usage, content)
        return content
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI generate title error:', message)
        return `${gradeLabel}${typeLabel}：${defaultTaskTitle[type]}`
    }
}

export async function generateTitle(
    content: string,
    type: TaskType,
    taskId?: number,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return taskTypeDefaultTitles[type]
    }

    const prompt: string = defaultPromptGenerateTitle
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskContent}', content.slice(0, 2000))

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [
                { role: 'user', content: prompt } as DeepSeekMessage,
            ],
            temperature: 0.7,
            max_tokens: 50,
        })

        await logAiUsage('ai-title', usage, reply, taskId)
        return reply
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

    const taskTitle = title ? `题目：${title}` : '无指定题目，请根据内容评判'
    const prompt: string = defaultPromptScoreComposition
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskTitle}', taskTitle)
        .replace('{taskContent}', content.slice(0, 4000))

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [
                { role: 'user', content: prompt } as DeepSeekMessage,
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        })

        await logAiUsage('ai-score', usage, title, taskId)

        const result = safeJsonParse<DeepSeekParsedResult | null>(reply, null)

        if (!result || typeof result !== 'object') {
            throw new Error('Invalid AI score response format')
        }

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

export async function analyzeWeeklyReport(
    content: WeeklyReportContent,
    weekLabel?: string,
    teacherName?: string,
    studentGrade?: string,
): Promise<WeeklyAnalysis> {
    if (!DEEPSEEK_API_KEY) {
        return {
            praise: 'AI 分析未配置，请设置 DEEPSEEK_API_KEY',
            difficultyHelp: '',
            goalAdvice: '',
            aiFeedbackAdvice: '',
            summary: '',
        }
    }

    const teacherPrefix = teacherName ? `${teacherName}老师` : '老师'
    const gradePrefix = studentGrade ? `（${studentGrade}）` : ''
    const prompt = `你是一位专业的学习辅导老师${teacherPrefix}，请针对${gradePrefix}学生，对以下学习周报进行分析并生成鼓励和建议。

周报内容：
- 学到的东西：${content.learned}
- 遇到的困难：${content.difficulties}
- 没有掌握的知识点：${content.weakPoints}
- 最有成就感的事：${content.achievement}
- 上周目标达成情况：${content.lastWeekGoalReview}
- SMART目标 - 具体(S)：${content.smartGoalS}
- SMART目标 - 可衡量(M)：${content.smartGoalM}
- SMART目标 - 可实现(A)：${content.smartGoalA}
- SMART目标 - 相关(R)：${content.smartGoalR}
- SMART目标 - 有时限(T)：${content.smartGoalT}
- 改进方法：${content.improvement}

请返回 JSON 格式，包含以下字段：
1. praise: 对学到的东西和成就感进行鼓励和表扬，提出更多建议（200字以内）
2. difficultyHelp: 对遇到的困难和未掌握的知识点进行分析，提供解决方案（300字以内）
3. goalAdvice: 对SMART目标、改进方法进行分析和完善建议（200字以内）
4. aiFeedbackAdvice: 给予整体建议和鼓励（100字以内）
5. summary: 总体评价，积极正面（100字以内）

注意：在回复内容中，请以「${teacherPrefix}」自称。如「${teacherPrefix}的小建议：」`

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [
                { role: 'user', content: prompt } as DeepSeekMessage,
            ],
            temperature: 0.7,
            max_tokens: 2000,
            response_format: { type: 'json_object' },
        })

        await logAiUsage(
            'weekly-analyze',
            usage,
            weekLabel ? `${weekLabel}·周报分析` : '周报分析',
        )

        const parsed = safeJsonParse<Partial<WeeklyAnalysis> | null>(reply, null)
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid weekly analysis response format')
        }

        return {
            praise: parsed.praise || '',
            difficultyHelp: parsed.difficultyHelp || '',
            goalAdvice: parsed.goalAdvice || '',
            aiFeedbackAdvice: parsed.aiFeedbackAdvice || '',
            summary: parsed.summary || '',
        }
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI weekly analyze error:', message)
        return {
            praise: `分析出错：${message}，请稍后重试`,
            difficultyHelp: '',
            goalAdvice: '',
            aiFeedbackAdvice: '',
            summary: '',
        }
    }
}

export async function generateDemoSubmission(
    content: string,
    type: TaskType,
    title?: string,
    taskId?: number,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return 'AI 功能未配置，请设置 DEEPSEEK_API_KEY'
    }

    const taskTitle = title ? `《${title}》` : '未命名作业'
    const taskType = taskTypeLabels[type]
    const demoContent = content.slice(0, 1000) || '（暂无提交内容）'

    const prompt = `你是一名优秀的学生，请根据以下作业信息，生成一篇高质量的示范作业。

作业类型：${taskType}
作业题目：${taskTitle}
当前提交内容：${demoContent}

要求：
1. 写一篇完整的示范作业，体现高质量水平
2. 布局清晰，使用 Markdown 格式
3. 内容符合${taskType}的写作规范
4. 字数在 300-800 字之间
5. 示范作业应该能够启发学生更好的完成自己的作业

请直接输出示范作业，不需要额外说明。`

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [
                { role: 'user', content: prompt } as DeepSeekMessage,
            ],
            temperature: 0.7,
            max_tokens: 2000,
        })

        await logAiUsage('task-chat', usage, title || taskType, taskId)
        return reply
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI demo submission error:', message)
        return `生成示范作业出错：${message}，请稍后重试`
    }
}

export async function chatAboutTask(
    content: string,
    type: TaskType,
    title: string,
    messages: ChatMessage[],
    taskId?: number,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return 'AI 对话未配置，请设置 DEEPSEEK_API_KEY'
    }

    const taskTitle = title ? `《${title}》` : '未命名作业'
    const taskType = taskTypeLabels[type]
    const taskContent = content.slice(0, 1500) || '（暂无提交内容）'

    const systemPrompt = `你是一位专业的作业辅导老师，请基于以下作业信息帮助学生。

作业类型：${taskType}
作业题目：${taskTitle}
学生提交的作业内容：${taskContent}

你的职责：
1. 回答学生关于作业的疑问，提供指导和建议
2. 帮助学生分析作业的优缺点，提出改进方向
3. 用友善、鼓励的语气交流
4. 回复使用 Markdown 格式，清晰易读
5. 不要直接替学生完成作业，而是引导他们自己思考`

    const apiMessages: DeepSeekMessage[] = [
        { role: 'system', content: systemPrompt } as DeepSeekMessage,
        ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        })) as DeepSeekMessage[],
    ]

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 2000,
        })

        await logAiUsage('task-chat', usage, title || taskType, taskId)
        return reply
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI task chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}

export async function chatAboutWeeklyReport(
    content: WeeklyReportContent,
    messages: ChatMessage[],
    weekLabel?: string,
    teacherName?: string,
    studentGrade?: string,
): Promise<string> {
    if (!DEEPSEEK_API_KEY) {
        return 'AI 对话未配置，请设置 DEEPSEEK_API_KEY'
    }

    const teacherPrefix = teacherName ? `${teacherName}老师` : '老师'
    const gradePrefix = studentGrade ? `（${studentGrade}）` : ''
    const systemPrompt = `你是${teacherPrefix}${gradePrefix}，一位学习周报助手，基于以下周报内容回答孩子的问题。请用友善、鼓励的语气，帮助孩子改进学习方法。在回复中请以「${teacherPrefix}」自称。

周报内容：
- 学到的东西：${content.learned}
- 遇到的困难：${content.difficulties}
- 没有掌握的知识点：${content.weakPoints}
- 最有成就感的事：${content.achievement}
- 上周目标达成情况：${content.lastWeekGoalReview}
- SMART目标 - 具体(S)：${content.smartGoalS}
- SMART目标 - 可衡量(M)：${content.smartGoalM}
- SMART目标 - 可实现(A)：${content.smartGoalA}
- SMART目标 - 相关(R)：${content.smartGoalR}
- SMART目标 - 有时限(T)：${content.smartGoalT}
- 改进方法：${content.improvement}`

    const apiMessages: DeepSeekMessage[] = [
        { role: 'system', content: systemPrompt } as DeepSeekMessage,
        ...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        })) as DeepSeekMessage[],
    ]

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 2000,
        })

        await logAiUsage(
            'weekly-chat',
            usage,
            weekLabel ? `${weekLabel}·周报对话` : '周报对话',
        )

        return reply
    } catch (error: unknown) {
        const message: string =
            error instanceof Error ? error.message : String(error)
        console.error('AI weekly chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}
