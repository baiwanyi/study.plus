import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { studynotesSubjectValues } from '@shared/utils'
import { db } from '../db/index'
import {
    studynotes,
    studynoteConversations,
    studynoteMessages,
} from '../db/schema'
import {
    evaluateStudynotesReflection,
    studynotesFollowUpChat,
} from '../services/ai'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'

export const studynotesRouter = Router()

/** Validate `:id` param is a positive integer; returns -1 if invalid */
function parseCardId(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}

const VALID_SUBJECTS = new Set<string>(studynotesSubjectValues)

// List studynotes cards with optional subject filter and search
studynotesRouter.get('/', async (req: Request, res: Response) => {
    try {
        const { subject, search } = req.query

        // Build filter conditions dynamically to avoid Drizzle type issue
        const filters: SQL[] = []
        if (
            subject &&
            typeof subject === 'string' &&
            VALID_SUBJECTS.has(subject)
        ) {
            filters.push(eq(studynotes.subject, subject))
        }

        // Fetch cards
        const cards = await db
            .select()
            .from(studynotes)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(studynotes.createdAt))

        // Fetch follow-up message counts per card (GROUP BY avoids N+1 with JS counting).
        // Only count assistant replies to reflect actual AI follow-up turns.
        const countRows = await db
            .select({
                cardId: studynoteConversations.studynoteId,
                count: sql<number>`COUNT(*)`,
            })
            .from(studynoteConversations)
            .innerJoin(
                studynoteMessages,
                eq(studynoteMessages.conversationId, studynoteConversations.id),
            )
            .where(eq(studynoteMessages.role, 'assistant'))
            .groupBy(studynoteConversations.studynoteId)

        const countMap = new Map(countRows.map((r) => [r.cardId, r.count]))

        const result = cards.map((card) => ({
            ...card,
            followUpCount: countMap.get(card.id) ?? 0,
        }))

        // Apply search filter in-memory for simplicity
        if (search && typeof search === 'string') {
            const keyword = search.toLowerCase()
            return res.json(
                result.filter(
                    (r) =>
                        r.topic.toLowerCase().includes(keyword) ||
                        r.summary.toLowerCase().includes(keyword) ||
                        r.example.toLowerCase().includes(keyword) ||
                        r.stuckPoints.toLowerCase().includes(keyword),
                ),
            )
        }

        res.json(result)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error listing studynotes cards:', message)
        res.status(500).json({ error: '获取学习心得列表失败' })
    }
})

// Get single studynotes card
studynotesRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting studynotes card:', message)
        res.status(500).json({ error: '获取学习心得失败' })
    }
})

// Create studynotes card
studynotesRouter.post('/', async (req: Request, res: Response) => {
    try {
        const { subject, topic, summary, example, stuckPoints, memoryHook } =
            req.body

        // Validate required fields: must be non-empty strings (reject arrays/objects)
        if (
            typeof subject !== 'string' ||
            typeof summary !== 'string' ||
            typeof example !== 'string' ||
            typeof stuckPoints !== 'string' ||
            !subject.trim() ||
            !summary.trim() ||
            !example.trim()
        ) {
            res.status(400).json({ error: '学科、概括、例子为必填项' })
            return
        }

        if (!VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const rows = await db
            .insert(studynotes)
            .values({
                subject,
                topic: typeof topic === 'string' ? topic : '',
                summary,
                example,
                stuckPoints,
                memoryHook: typeof memoryHook === 'string' ? memoryHook : null,
            })
            .returning()

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error creating studynotes card:', message)
        res.status(500).json({ error: '创建学习心得失败' })
    }
})

// Update studynotes card
studynotesRouter.put('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const { subject, topic, summary, example, stuckPoints, memoryHook } =
            req.body

        // Validate at least one content field is provided
        if (
            subject === undefined &&
            topic === undefined &&
            summary === undefined &&
            example === undefined &&
            stuckPoints === undefined &&
            memoryHook === undefined
        ) {
            res.status(400).json({ error: '请提供至少一个要更新的字段' })
            return
        }

        if (
            (subject !== undefined && typeof subject !== 'string') ||
            (summary !== undefined && typeof summary !== 'string') ||
            (example !== undefined && typeof example !== 'string') ||
            (stuckPoints !== undefined && typeof stuckPoints !== 'string') ||
            (topic !== undefined && typeof topic !== 'string') ||
            (memoryHook !== undefined &&
                typeof memoryHook !== 'string' &&
                memoryHook !== null)
        ) {
            res.status(400).json({ error: '字段类型错误' })
            return
        }

        if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const rows = await db
            .update(studynotes)
            .set({
                ...(subject !== undefined && { subject }),
                ...(topic !== undefined && { topic }),
                ...(summary !== undefined && { summary }),
                ...(example !== undefined && { example }),
                ...(stuckPoints !== undefined && { stuckPoints }),
                ...(memoryHook !== undefined && { memoryHook }),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(studynotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error updating studynotes card:', message)
        res.status(500).json({ error: '更新学习心得失败' })
    }
})

// Delete studynotes card
studynotesRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .delete(studynotes)
            .where(eq(studynotes.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting studynotes card:', message)
        res.status(500).json({ error: '删除学习心得失败' })
    }
})

// AI evaluate studynotes card
studynotesRouter.post('/:id/evaluate', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        const evaluationRaw = await evaluateStudynotesReflection(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
        )

        const evaluation = JSON.parse(evaluationRaw)

        const now = new Date().toISOString()
        await db
            .update(studynotes)
            .set({
                evaluation: evaluationRaw,
                evaluatedAt: now,
                updatedAt: now,
            })
            .where(eq(studynotes.id, id))

        res.json({
            evaluation,
            evaluatedAt: now,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error evaluating studynotes card:', message)
        res.status(500).json({ error: 'AI 评估失败' })
    }
})

// AI follow-up chat
studynotesRouter.post('/:id/follow-up', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(studynotes)
            .where(eq(studynotes.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '学习心得未找到' })
            return
        }

        const card = rows[0]
        const userMessage =
            typeof req.body?.message === 'string' ? req.body.message.trim() : ''

        let conversationId: number
        const existingConv = await db
            .select()
            .from(studynoteConversations)
            .where(eq(studynoteConversations.studynoteId, id))
            .limit(1)

        if (existingConv[0]) {
            conversationId = existingConv[0].id
        } else {
            try {
                const newConv = await db
                    .insert(studynoteConversations)
                    .values({ studynoteId: id })
                    .returning()
                conversationId = newConv[0].id
            } catch {
                const retry = await db
                    .select()
                    .from(studynoteConversations)
                    .where(eq(studynoteConversations.studynoteId, id))
                    .limit(1)
                if (!retry[0]) throw new Error('创建对话失败')
                conversationId = retry[0].id
            }
        }

        if (userMessage) {
            await db.insert(studynoteMessages).values({
                conversationId,
                role: 'user',
                content: userMessage,
            })
        }

        const prevMessages = await db
            .select()
            .from(studynoteMessages)
            .where(eq(studynoteMessages.conversationId, conversationId))
            .orderBy(asc(studynoteMessages.createdAt))

        const aiReply = await studynotesFollowUpChat(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
            prevMessages,
            userMessage || undefined,
        )

        // 测验出错时（如 AI 返回为空）不允许将错误信息写入数据库
        if (aiReply.startsWith('追问出错：')) {
            throw new Error(aiReply)
        }

        await db.insert(studynoteMessages).values({
            conversationId,
            role: 'assistant',
            content: aiReply,
        })

        // 解析 AI 回复中的掌握程度评分，保存到卡片
        const scoreMatch = aiReply.match(/【掌握程度评分】\s*(\d+)\s*分/)
        if (scoreMatch) {
            const followUpScore = Number.parseInt(scoreMatch[1], 10)
            if (!Number.isNaN(followUpScore)) {
                await db
                    .update(studynotes)
                    .set({
                        followUpScore,
                        updatedAt: new Date().toISOString(),
                    })
                    .where(eq(studynotes.id, id))
            }
        }

        await db
            .update(studynoteConversations)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(studynoteConversations.id, conversationId))

        const allMessages = await db
            .select()
            .from(studynoteMessages)
            .where(eq(studynoteMessages.conversationId, conversationId))
            .orderBy(asc(studynoteMessages.createdAt))

        res.json({ messages: allMessages })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error in studynotes follow-up:', message)
        res.status(500).json({ error: 'AI 测验失败' })
    }
})

// GET conversation messages for a studynotes card
studynotesRouter.get('/:id/messages', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const conv = await db
            .select()
            .from(studynoteConversations)
            .where(eq(studynoteConversations.studynoteId, id))
            .limit(1)

        if (!conv[0]) {
            res.json([])
            return
        }

        const messages = await db
            .select()
            .from(studynoteMessages)
            .where(eq(studynoteMessages.conversationId, conv[0].id))
            .orderBy(asc(studynoteMessages.createdAt))

        res.json(messages)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting studynotes messages:', message)
        res.status(500).json({ error: '获取对话消息失败' })
    }
})
