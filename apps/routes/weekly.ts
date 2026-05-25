import { Router, type Request, type Response } from 'express'
import { db } from '@apps/db/index'
import { weeklyReports, weeklyConversations, weeklyMessages, options } from '@apps/db/schema'
import { desc, eq, asc } from 'drizzle-orm'
import { analyzeWeeklyReport, chatAboutWeeklyReport } from '@apps/services/ai'
import { DEFAULT_WEEKLY_AI_HELPER } from '@apps/lib/default'
import { parseContent, stringifyContent } from '@apps/lib/weekly'
import { taskClassLabels } from '@apps/lib/utils'
import type { WeeklyAnalysis, ChatMessage } from '@apps/lib/types'
import type { WeeklyReportContent } from '@apps/lib/weekly'

const router = Router()

/** 从 options 表加载 AI 助手名称，无配置时使用默认值 */
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
                if (parsed && typeof parsed === 'object' && 'display_name' in parsed) {
                    return String((parsed as Record<string, unknown>).display_name)
                }
                if (typeof parsed === 'string') return parsed
                return raw
            } catch {
                return raw
            }
        }
    } catch { /* 使用默认值 */ }
    return DEFAULT_WEEKLY_AI_HELPER
}

/** 从 options 表的 system 键加载年级，如 "一年级"，无配置时返回空字符串 */
async function loadStudentGrade(): Promise<string> {
    try {
        const rows = await db
            .select()
            .from(options)
            .where(eq(options.key, 'system'))
        if (rows[0]?.value) {
            const parsed: Record<string, unknown> = JSON.parse(String(rows[0].value))
            const gradeNum = Number(parsed.grade)
            if (gradeNum >= 0 && gradeNum < taskClassLabels.length) {
                return taskClassLabels[gradeNum]
            }
        }
    } catch { /* 使用空字符串 */ }
    return ''
}

// GET / — 按年份筛选列表
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
        const message =
            err instanceof Error ? err.message : '查询周报失败'
        console.error('GET /api/weekly error:', message)
        res.status(500).json({ error: message })
    }
})

// POST / — 创建周报
router.post('/', async (req: Request, res: Response) => {
    try {
        const { weekNumber, year, content } = req.body as {
            weekNumber: number
            year: number
            content: WeeklyReportContent
        }

        if (!weekNumber || !year || !content) {
            res.status(400).json({
                error: '缺少必要字段：weekNumber, year, content',
            })
            return
        }

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
        const message =
            err instanceof Error ? err.message : '创建周报失败'
        console.error('POST /api/weekly error:', message)
        res.status(500).json({ error: message })
    }
})

// PUT /:id — 更新周报
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id)
        const { content } = req.body as { content: WeeklyReportContent }

        if (!content) {
            res.status(400).json({ error: '缺少必要字段：content' })
            return
        }

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
        const message =
            err instanceof Error ? err.message : '更新周报失败'
        console.error('PUT /api/weekly/:id error:', message)
        res.status(500).json({ error: message })
    }
})

// DELETE /:id — 删除周报（级联删除会话和消息）
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id)
        await db.delete(weeklyReports).where(eq(weeklyReports.id, id))
        res.json({ success: true })
    } catch (err: unknown) {
        const message =
            err instanceof Error ? err.message : '删除周报失败'
        console.error('DELETE /api/weekly/:id error:', message)
        res.status(500).json({ error: message })
    }
})

// POST /:id/analyze — AI 分析周报（创建会话 + 初始消息）
router.post('/:id/analyze', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id)
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
        const analysis: WeeklyAnalysis =
            await analyzeWeeklyReport(content, weekLabel, teacherName, studentGrade)

        // Save analysis to report
        await db
            .update(weeklyReports)
            .set({
                analysis: JSON.stringify(analysis),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(weeklyReports.id, id))

        // Create conversation with initial analysis message (only if none exists)
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
        const message =
            err instanceof Error ? err.message : 'AI分析失败'
        console.error('POST /api/weekly/:id/analyze error:', message)
        res.status(500).json({ error: message })
    }
})

// GET /:id/conversation — 获取周报的会话和消息
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
        const message =
            err instanceof Error ? err.message : '查询会话失败'
        console.error('GET /api/weekly/:id/conversation error:', message)
        res.status(500).json({ error: message })
    }
})

// POST /:id/chat — AI 对话（接收用户消息，保存到 weekly_messages）
router.post('/:id/chat', async (req: Request, res: Response) => {
    try {
        const id = Number(req.params.id)
        const { message } = req.body as { message: string }

        if (!message?.trim()) {
            res.status(400).json({ error: '消息不能为空' })
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

        // Get or create conversation
        let [conv] = await db
            .select()
            .from(weeklyConversations)
            .where(eq(weeklyConversations.weeklyReportId, id))
            .limit(1)

        if (!conv) {
            [conv] = await db
                .insert(weeklyConversations)
                .values({ weeklyReportId: id })
                .returning()
        }

        // Save user message
        await db.insert(weeklyMessages).values({
            conversationId: conv.id,
            role: 'user',
            content: message,
        })

        // Load ALL messages for AI context
        const existingMessages = await db
            .select()
            .from(weeklyMessages)
            .where(eq(weeklyMessages.conversationId, conv.id))
            .orderBy(asc(weeklyMessages.id))

        const contextMessages: ChatMessage[] = existingMessages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        }))

        // Get AI reply
        const contentParsed = parseContent(report.content)
        const weekLabel = `${report.year}年${report.weekNumber}周`
        const teacherName = await loadAiTeacherName()
        const studentGrade = await loadStudentGrade()
        const reply: string =
            await chatAboutWeeklyReport(contentParsed, contextMessages, weekLabel, teacherName, studentGrade)

        // Save AI reply
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
        const message =
            err instanceof Error ? err.message : 'AI对话失败'
        console.error('POST /api/weekly/:id/chat error:', message)
        res.status(500).json({ error: message })
    }
})

export default router
