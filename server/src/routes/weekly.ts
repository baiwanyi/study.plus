import { desc, eq, asc } from 'drizzle-orm'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { DEFAULT_WEEKLY_AI_HELPER } from '@shared/constants'
import { taskClassLabels } from '@shared/utils'
import {
    parseContent,
    stringifyContent,
    WeeklyContentSchema,
} from '@shared/weekly'
import { db } from '../db/index'
import {
    weeklyReports,
    weeklyConversations,
    weeklyMessages,
    options,
} from '../db/schema'
import { analyzeWeeklyReport, chatAboutWeeklyReport } from '../services/ai'
import { aiLimiter } from '../utils/rate-limit'
import { parsePosInt } from '../utils/param'
import type { WeeklyAnalysis, ChatMessage } from '@shared/types'

const router = Router()

const createWeeklySchema = z.object({
    weekNumber: z
        .number()
        .int('周次必须为整数')
        .min(1, '周次至少为 1')
        .max(53, '周次最多为 53'),
    year: z
        .number()
        .int('年份必须为整数')
        .min(2000, '年份不合法')
        .max(2100, '年份不合法'),
    content: WeeklyContentSchema,
})

const updateWeeklySchema = z.object({
    content: WeeklyContentSchema,
})

const weeklyChatSchema = z.object({
    message: z.string().min(1, '消息内容不能为空').max(2000, '消息内容过长'),
})

async function loadAiTeacherName(): Promise<string> {
    try {
        const rows = await db
            .select()
            .from(options)
            .where(eq(options.key, 'weeklyAiHelper'))
        if (rows[0]?.value) {
            const raw = String(rows[0].value)
            try {
                const parsed: unknown = JSON.parse(raw)
                if (
                    parsed &&
                    typeof parsed === 'object' &&
                    'display_name' in parsed
                ) {
                    return String(
                        (parsed as Record<string, unknown>).display_name,
                    )
                }
                if (typeof parsed === 'string') return parsed
                return raw
            } catch {
                return raw
            }
        }
    } catch {}
    return DEFAULT_WEEKLY_AI_HELPER
}

async function loadStudentGrade(): Promise<string> {
    try {
        const rows = await db
            .select()
            .from(options)
            .where(eq(options.key, 'system'))
        if (rows[0]?.value) {
            const parsed: Record<string, unknown> = JSON.parse(
                String(rows[0].value),
            )
            const gradeNum = Number(parsed.grade)
            if (gradeNum >= 0 && gradeNum < taskClassLabels.length) {
                return taskClassLabels[gradeNum]
            }
        }
    } catch {}
    return ''
}

router.get('/', async (req: Request, res: Response) => {
    try {
        const year = req.query.year ? Number(req.query.year) : undefined
        const query = db
            .select()
            .from(weeklyReports)
            .orderBy(desc(weeklyReports.year), desc(weeklyReports.weekNumber))

        if (year) {
            query.where(eq(weeklyReports.year, year))
        }

        const reports = await query
        res.json(reports)
    } catch (err: unknown) {
        console.error('查询周报失败:', err)
        res.status(500).json({ error: '查询周报失败' })
    }
})

router.post('/', async (req: Request, res: Response) => {
    try {
        const parsed = createWeeklySchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: parsed.error.issues[0]?.message ?? '请求参数无效',
            })
            return
        }
        const { weekNumber, year, content } = parsed.data

        const [report] = await db
            .insert(weeklyReports)
            .values({
                weekNumber,
                year,
                content: stringifyContent(content),
            })
            .returning()

        res.status(201).json(report)
    } catch (err: unknown) {
        console.error('创建周报失败:', err)
        res.status(500).json({ error: '创建周报失败' })
    }
})

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id < 0) {
            res.status(400).json({ error: '周报 ID 必须为正整数' })
            return
        }
        const parsed = updateWeeklySchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: parsed.error.issues[0]?.message ?? '请求参数无效',
            })
            return
        }
        const { content } = parsed.data

        const [report] = await db
            .update(weeklyReports)
            .set({
                content: stringifyContent(content),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(weeklyReports.id, id))
            .returning()

        if (!report) {
            res.status(404).json({ error: '周报不存在' })
            return
        }

        res.json(report)
    } catch (err: unknown) {
        console.error('更新周报失败:', err)
        res.status(500).json({ error: '更新周报失败' })
    }
})

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id < 0) {
            res.status(400).json({ error: '周报 ID 必须为正整数' })
            return
        }
        await db.delete(weeklyReports).where(eq(weeklyReports.id, id))
        res.json({ success: true })
    } catch (err: unknown) {
        console.error('删除周报失败:', err)
        res.status(500).json({ error: '删除周报失败' })
    }
})

router.post('/:id/analyze', aiLimiter, async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id < 0) {
            res.status(400).json({ error: '周报 ID 必须为正整数' })
            return
        }
        const [report] = await db
            .select()
            .from(weeklyReports)
            .where(eq(weeklyReports.id, id))

        if (!report) {
            res.status(404).json({ error: '周报不存在' })
            return
        }

        const content = parseContent(report.content)
        const weekLabel = `${report.year}年${report.weekNumber}周`
        const teacherName = await loadAiTeacherName()
        const studentGrade = await loadStudentGrade()
        const analysis: WeeklyAnalysis = await analyzeWeeklyReport(
            content,
            weekLabel,
            teacherName,
            studentGrade,
        )

        await db
            .update(weeklyReports)
            .set({
                analysis: JSON.stringify(analysis),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(weeklyReports.id, id))

        const [existingConv] = await db
            .select()
            .from(weeklyConversations)
            .where(eq(weeklyConversations.weeklyReportId, id))
            .limit(1)

        if (!existingConv) {
            const [conv] = await db
                .insert(weeklyConversations)
                .values({ weeklyReportId: id })
                .returning()
            await db.insert(weeklyMessages).values({
                conversationId: conv.id,
                role: 'assistant',
                content: analysis.summary,
            })
        }

        res.json({ analysis })
    } catch (err: unknown) {
        console.error('AI 分析周报失败:', err)
        res.status(500).json({ error: 'AI 分析周报失败' })
    }
})

router.get('/:id/conversation', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id)
        const [conv] = await db
            .select()
            .from(weeklyConversations)
            .where(eq(weeklyConversations.weeklyReportId, id))
            .limit(1)

        if (!conv) {
            res.json({ conversation: null, messages: [] })
            return
        }

        const messages = await db
            .select()
            .from(weeklyMessages)
            .where(eq(weeklyMessages.conversationId, conv.id))
            .orderBy(asc(weeklyMessages.id))

        res.json({ conversation: conv, messages })
    } catch (err: unknown) {
        console.error('查询会话失败:', err)
        res.status(500).json({ error: '查询会话失败' })
    }
})

router.post('/:id/chat', aiLimiter, async (req: Request, res: Response) => {
    try {
        const id = parsePosInt(req.params.id)
        if (id < 0) {
            res.status(400).json({ error: '周报 ID 必须为正整数' })
            return
        }
        const parsed = weeklyChatSchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({
                error: parsed.error.issues[0]?.message ?? '请求参数无效',
            })
            return
        }
        const { message } = parsed.data

        const [report] = await db
            .select()
            .from(weeklyReports)
            .where(eq(weeklyReports.id, id))

        if (!report) {
            res.status(404).json({ error: '周报不存在' })
            return
        }

        let [conv] = await db
            .select()
            .from(weeklyConversations)
            .where(eq(weeklyConversations.weeklyReportId, id))
            .limit(1)

        if (!conv) {
            ;[conv] = await db
                .insert(weeklyConversations)
                .values({ weeklyReportId: id })
                .returning()
        }

        await db.insert(weeklyMessages).values({
            conversationId: conv.id,
            role: 'user',
            content: message,
        })

        const existingMessages = await db
            .select()
            .from(weeklyMessages)
            .where(eq(weeklyMessages.conversationId, conv.id))
            .orderBy(asc(weeklyMessages.id))

        const contextMessages: ChatMessage[] = existingMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }))

        const contentParsed = parseContent(report.content)
        const weekLabel = `${report.year}年${report.weekNumber}周`
        const teacherName = await loadAiTeacherName()
        const studentGrade = await loadStudentGrade()
        const reply: string = await chatAboutWeeklyReport(
            contentParsed,
            contextMessages,
            weekLabel,
            teacherName,
            studentGrade,
        )

        await db.insert(weeklyMessages).values({
            conversationId: conv.id,
            role: 'assistant',
            content: reply,
        })

        await db
            .update(weeklyConversations)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(weeklyConversations.id, conv.id))

        res.json({ reply })
    } catch (err: unknown) {
        console.error('AI 对话周报失败:', err)
        res.status(500).json({ error: 'AI 对话周报失败' })
    }
})

export { router as weeklyRouter }
