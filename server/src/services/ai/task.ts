import {
    defaultPromptGenerateTitle,
    defaultPromptScoreComposition,
    defaultPromptTaskTitleComposition,
    defaultPromptTaskTitleMindmap,
    defaultPromptTaskTitleNotes,
    defaultTaskTitle,
} from '@shared/constants'
import {
    defaultGradeValues,
    taskClassLabels,
    taskTypeDefaultTitles,
    taskTypeLabels,
} from '@shared/utils'
import type { ChatMessage, TaskGrade, TaskType } from '@shared/types'

import {
    callDeepSeek,
    DEEPSEEK_API_KEY,
    logAiUsage,
    safeJsonParse,
} from './core'
import type {
    AIScoreResult,
    DeepSeekMessage,
    DeepSeekParsedResult,
} from './core'

export async function generateTaskTitle(
    type: TaskType,
    grade: number,
): Promise<string> {
    const gradeLabel = taskClassLabels[grade] || '未定级'
    const typeLabel = taskTypeLabels[type]
    const promptMap: Partial<Record<TaskType, string>> = {
        mindmap: defaultPromptTaskTitleMindmap.replace(
            '{taskGrade}',
            gradeLabel,
        ),
        composition: defaultPromptTaskTitleComposition.replace(
            '{taskGrade}',
            gradeLabel,
        ),
        notes: defaultPromptTaskTitleNotes.replace('{taskGrade}', gradeLabel),
    }

    if (!DEEPSEEK_API_KEY) {
        return `${gradeLabel}${typeLabel}：${defaultTaskTitle[type]}`
    }

    const userPrompt =
        promptMap[type] ??
        `请为${gradeLabel}学生出一道${typeLabel}题目，要求新颖有趣。只返回题目文本。`

    try {
        const { content, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: userPrompt }],
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

    const prompt = defaultPromptGenerateTitle
        .replace('{taskType}', () => taskTypeLabels[type])
        .replace('{taskContent}', () => content.slice(0, 2000))

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
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

    // For book notes (notes type), parse JSON structured data into readable text
    let processedContent = content
    if (type === 'notes') {
        try {
            const parsed = JSON.parse(content) as {
                bookInfo?: {
                    bookName?: string
                    chapter?: string
                    author?: string
                }
                goodWords?: string
                excerpts?: Array<{ sentence?: string; insight?: string }>
                reflection?: { mainContent?: string; thoughts?: string }
            }
            const lines = []
            if (parsed.bookInfo) {
                lines.push(`书名：${parsed.bookInfo.bookName || ''}`)
                lines.push(`篇目：${parsed.bookInfo.chapter || ''}`)
                lines.push(`作者：${parsed.bookInfo.author || ''}`)
                lines.push('')
            }
            if (parsed.goodWords) {
                const words = parsed.goodWords.split('\n').filter(Boolean)
                lines.push(`累积好词：${words.join('、')}`)
                lines.push('')
            }
            if (parsed.excerpts && parsed.excerpts.length > 0) {
                lines.push('摘抄赏析：')
                parsed.excerpts.forEach((ex) => {
                    lines.push(
                        `- "${ex.sentence || ''}"（赏析：${ex.insight || ''}）`,
                    )
                })
                lines.push('')
            }
            lines.push('读后感：')
            if (parsed.reflection?.mainContent) {
                lines.push(`[主要内容] ${parsed.reflection.mainContent}`)
            }
            if (parsed.reflection?.thoughts) {
                lines.push(`[我的感想] ${parsed.reflection.thoughts}`)
            }
            processedContent = lines.join('\n')
        } catch {
            // fallback to raw content
        }
    }

    const taskTitle = title ? `题目：${title}` : '无指定题目，请根据内容评判'
    const prompt = defaultPromptScoreComposition
        .replace('{taskType}', () => taskTypeLabels[type])
        .replace('{taskTitle}', () => taskTitle)
        .replace('{taskContent}', () => processedContent.slice(0, 4000))

    try {
        const { content: reply, usage } = await callDeepSeek({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            response_format: { type: 'json_object' },
        })

        await logAiUsage('ai-score', usage, title, taskId)

        const result = safeJsonParse<DeepSeekParsedResult | null>(reply, null)

        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new Error('Invalid AI score response format')
        }

        const parsedGrade = result.grade as TaskGrade
        const grade: TaskGrade = defaultGradeValues.includes(parsedGrade)
            ? parsedGrade
            : 'B'

        return {
            grade,
            score: Number.isFinite(Number(result.score))
                ? Number(result.score)
                : 75,
            comment: result.comment || '',
            suggestions: Array.isArray(result.suggestions)
                ? result.suggestions
                : [],
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI scoring error:', message)
        return {
            grade: 'B',
            score: 75,
            comment: `AI 评分出错：${message}`,
            suggestions: ['请稍后重试'],
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
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
        })

        await logAiUsage('task-chat', usage, title || taskType, taskId)
        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
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
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
            role: m.role,
            content: m.content,
        })),
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
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI task chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}
