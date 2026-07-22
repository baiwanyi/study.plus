import { callAi, logAiUsage, safeJsonParse, type AiMessage } from './client'
import {
    defaultPromptGenerateTitle,
    defaultPromptScoreComposition,
    defaultPromptScoreNotes,
    defaultPromptTaskTitleComposition,
    defaultPromptTaskTitleMindmap,
    defaultPromptTaskTitleNotes,
} from './prompts'
import type { AIScoreResult, ChatMessage, TaskGrade, TaskType } from '../types'
import {
    defaultGradeValues,
    defaultTaskTitle,
    taskClassLabels,
    taskTypeDefaultTitles,
    taskTypeLabels,
} from '../constants'

interface DeepSeekParsedResult {
    grade: string
    score: number | string
    comment: string
    suggestions: string[]
}

export async function generateTaskTitle(
    type: TaskType,
    grade: number,
    context: { userId?: number },
): Promise<string> {
    const gradeLabel = taskClassLabels[grade] || '未定级'
    const typeLabel = taskTypeLabels[type]
    const promptMap: Partial<Record<TaskType, string>> = {
        mindmap: defaultPromptTaskTitleMindmap.replace('{taskGrade}', gradeLabel),
        composition: defaultPromptTaskTitleComposition.replace('{taskGrade}', gradeLabel),
        notes: defaultPromptTaskTitleNotes.replace('{taskGrade}', gradeLabel),
    }
    const userPrompt =
        promptMap[type] ??
        `请为${gradeLabel}学生出一道${typeLabel}题目，要求新颖有趣。只返回题目文本。`

    try {
        const { content, usage } = await callAi({
            messages: [{ role: 'user', content: userPrompt }],
            temperature: 0.8,
            maxTokens: 60,
            quotaUserId: context.userId,
        })
        await logAiUsage('ai-task', usage, { userId: context.userId })
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
    context: { userId?: number; taskId?: number },
): Promise<string> {
    const prompt = defaultPromptGenerateTitle
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskContent}', content.slice(0, 2000))

    try {
        const { content: reply, usage } = await callAi({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            maxTokens: 50,
            quotaUserId: context.userId,
        })
        await logAiUsage('ai-title', usage, {
            userId: context.userId,
            taskId: context.taskId,
            taskTitle: reply,
        })
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
    title: string | undefined,
    context: { userId?: number; taskId?: number },
): Promise<AIScoreResult> {
    let processedContent = content
    if (type === 'notes') {
        processedContent = parseNotesContent(content)
    }

    const taskTitle = title ? `题目：${title}` : '无指定题目，请根据内容评判'
    const scorePrompt =
        type === 'notes' ? defaultPromptScoreNotes : defaultPromptScoreComposition
    const prompt = scorePrompt
        .replace('{taskType}', taskTypeLabels[type])
        .replace('{taskTitle}', taskTitle)
        .replace('{taskContent}', processedContent.slice(0, 4000))

    try {
        const { content: reply, usage } = await callAi({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            responseFormat: { type: 'json_object' },
            quotaUserId: context.userId,
        })
        await logAiUsage('ai-score', usage, {
            userId: context.userId,
            taskId: context.taskId,
            taskTitle: title,
        })

        const result = safeJsonParse<DeepSeekParsedResult | null>(reply, null)
        if (!result || typeof result !== 'object' || Array.isArray(result)) {
            throw new Error('Invalid AI score response format')
        }

        const parsedGrade = result.grade as TaskGrade
        const grade: TaskGrade = (defaultGradeValues as readonly string[]).includes(parsedGrade)
            ? parsedGrade
            : 'B'

        return {
            grade,
            score: Number.isFinite(Number(result.score)) ? Number(result.score) : 75,
            comment: result.comment || '',
            suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
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
    title: string | undefined,
    context: { userId?: number; taskId?: number },
): Promise<string> {
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
        const { content: reply, usage } = await callAi({
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            maxTokens: 2000,
            quotaUserId: context.userId,
        })
        await logAiUsage('task-chat', usage, {
            userId: context.userId,
            taskId: context.taskId,
            taskTitle: title || taskType,
        })
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
    context: { userId?: number; taskId?: number },
): Promise<string> {
    const taskType = taskTypeLabels[type]
    const taskContent = content.slice(0, 1500) || '（暂无提交内容）'

    const systemPrompt = `你是一位专业的作业辅导老师，请基于以下作业信息帮助学生。

作业类型：${taskType}
作业题目：《${title}》
学生提交的作业内容：${taskContent}

你的职责：
1. 回答学生关于作业的疑问，提供指导和建议
2. 帮助学生分析作业的优缺点，提出改进方向
3. 用友善、鼓励的语气交流
4. 回复使用 Markdown 格式，清晰易读
5. 不要直接替学生完成作业，而是引导他们自己思考`

    const apiMessages: AiMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    try {
        const { content: reply, usage } = await callAi({
            messages: apiMessages,
            temperature: 0.7,
            maxTokens: 2000,
            quotaUserId: context.userId,
        })
        await logAiUsage('task-chat', usage, {
            userId: context.userId,
            taskId: context.taskId,
            taskTitle: title,
        })
        return reply
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI task chat error:', message)
        return `对话出错：${message}，请稍后重试`
    }
}

/** 将读书笔记结构化 JSON 转为可读文本供 AI 评分 */
function parseNotesContent(content: string): string {
    try {
        const parsed = JSON.parse(content) as {
            bookInfo?: { bookName?: string; chapter?: string; author?: string }
            goodWords?: string
            excerpts?: Array<{ sentence?: string; insight?: string }>
            reflection?: { mainContent?: string; thoughts?: string }
        }
        const lines: string[] = []
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
                lines.push(`- "${ex.sentence || ''}"（赏析：${ex.insight || ''}）`)
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
        return lines.join('\n')
    } catch {
        return content
    }
}
