import { and, desc, eq, asc, sql } from 'drizzle-orm'
import { Router } from 'express'
import { feynmanSubjectValues } from '@shared/utils'
import { db } from '../db/index'
import { feynmanCards, feynmanConversations, feynmanMessages } from '../db/schema'
import {
    evaluateFeynmanReflection,
    feynmanFollowUpChat,
} from '../services/ai'
import type { SQL } from 'drizzle-orm'
import type { Request, Response } from 'express'

export const feynmanRouter = Router()

/** Validate `:id` param is a positive integer; returns -1 if invalid */
function parseCardId(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}

const VALID_SUBJECTS = new Set<string>(feynmanSubjectValues)

// List feynman cards with optional subject filter and search
feynmanRouter.get('/', async (req: Request, res: Response) => {
    try {
        const { subject, search } = req.query

        // Build filter conditions dynamically to avoid Drizzle type issue
        const filters: SQL[] = []
        if (
            subject &&
            typeof subject === 'string' &&
            VALID_SUBJECTS.has(subject)
        ) {
            filters.push(eq(feynmanCards.subject, subject))
        }

        // Fetch cards
        const cards = await db
            .select()
            .from(feynmanCards)
            .where(filters.length > 0 ? and(...filters) : undefined)
            .orderBy(desc(feynmanCards.createdAt))

        // Fetch follow-up message counts per card (GROUP BY avoids N+1 with JS counting)
        const countRows = await db
            .select({
                cardId: feynmanConversations.feynmanCardId,
                count: sql<number>`COUNT(*)`,
            })
            .from(feynmanConversations)
            .innerJoin(
                feynmanMessages,
                eq(feynmanMessages.conversationId, feynmanConversations.id),
            )
            .groupBy(feynmanConversations.feynmanCardId)

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
        console.error('Error listing feynman cards:', message)
        res.status(500).json({ error: '获取费曼心得卡列表失败' })
    }
})

// Get single feynman card
feynmanRouter.get('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .select()
            .from(feynmanCards)
            .where(eq(feynmanCards.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '费曼心得卡未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting feynman card:', message)
        res.status(500).json({ error: '获取费曼心得卡失败' })
    }
})

// Create feynman card
feynmanRouter.post('/', async (req: Request, res: Response) => {
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
            !example.trim() ||
            !stuckPoints.trim()
        ) {
            res.status(400).json({ error: '学科、概括、例子、卡壳点为必填项' })
            return
        }

        if (!VALID_SUBJECTS.has(subject)) {
            res.status(400).json({ error: '无效的学科' })
            return
        }

        const rows = await db
            .insert(feynmanCards)
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
        console.error('Error creating feynman card:', message)
        res.status(500).json({ error: '创建费曼心得卡失败' })
    }
})

// Update feynman card
feynmanRouter.put('/:id', async (req: Request, res: Response) => {
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

        // Validate string fields are actually strings when provided.
        // memoryHook is nullable, so null is allowed (used to clear it).
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
            .update(feynmanCards)
            .set({
                ...(subject !== undefined && { subject }),
                ...(topic !== undefined && { topic }),
                ...(summary !== undefined && { summary }),
                ...(example !== undefined && { example }),
                ...(stuckPoints !== undefined && { stuckPoints }),
                ...(memoryHook !== undefined && { memoryHook }),
                updatedAt: new Date().toISOString(),
            })
            .where(eq(feynmanCards.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '费曼心得卡未找到' })
            return
        }

        res.json(rows[0])
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error updating feynman card:', message)
        res.status(500).json({ error: '更新费曼心得卡失败' })
    }
})

// Delete feynman card
feynmanRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const rows = await db
            .delete(feynmanCards)
            .where(eq(feynmanCards.id, id))
            .returning()

        if (!rows[0]) {
            res.status(404).json({ error: '费曼心得卡未找到' })
            return
        }

        res.json({ success: true })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error deleting feynman card:', message)
        res.status(500).json({ error: '删除费曼心得卡失败' })
    }
})

// AI evaluate feynman card
feynmanRouter.post('/:id/evaluate', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }
        const rows = await db
            .select()
            .from(feynmanCards)
            .where(eq(feynmanCards.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '费曼心得卡未找到' })
            return
        }

        const card = rows[0]
        const evaluationRaw = await evaluateFeynmanReflection(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
        )

        // Parse before save — fail early if AI returns invalid JSON
        const evaluation = JSON.parse(evaluationRaw)

        const now = new Date().toISOString()
        await db
            .update(feynmanCards)
            .set({
                evaluation: evaluationRaw,
                evaluatedAt: now,
                updatedAt: now,
            })
            .where(eq(feynmanCards.id, id))

        res.json({
            evaluation,
            evaluatedAt: now,
        })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error evaluating feynman card:', message)
        res.status(500).json({ error: 'AI 评估失败' })
    }
})

// AI follow-up chat (when stuckPoints is empty or "没有")
feynmanRouter.post('/:id/follow-up', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }
        const rows = await db
            .select()
            .from(feynmanCards)
            .where(eq(feynmanCards.id, id))
            .limit(1)

        if (!rows[0]) {
            res.status(404).json({ error: '费曼心得卡未找到' })
            return
        }

        const card = rows[0]
        const userMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : ''

        // Find or create conversation (try-catch handles concurrent creation race)
        let conversationId: number
        const existingConv = await db
            .select()
            .from(feynmanConversations)
            .where(eq(feynmanConversations.feynmanCardId, id))
            .limit(1)

        if (existingConv[0]) {
            conversationId = existingConv[0].id
        } else {
            try {
                const newConv = await db
                    .insert(feynmanConversations)
                    .values({ feynmanCardId: id })
                    .returning()
                conversationId = newConv[0].id
            } catch {
                // Race: another request created the conversation first — re-fetch
                const retry = await db
                    .select()
                    .from(feynmanConversations)
                    .where(eq(feynmanConversations.feynmanCardId, id))
                    .limit(1)
                if (!retry[0]) throw new Error('创建对话失败')
                conversationId = retry[0].id
            }
        }

        // Store user message if provided
        if (userMessage) {
            await db.insert(feynmanMessages).values({
                conversationId,
                role: 'user',
                content: userMessage,
            })
        }

        // Call AI with card content + optional user message
        const aiReply = await feynmanFollowUpChat(
            card.subject,
            card.topic,
            card.summary,
            card.example,
            card.stuckPoints,
            userMessage || undefined,
        )

        // Store assistant reply
        await db.insert(feynmanMessages).values({
            conversationId,
            role: 'assistant',
            content: aiReply,
        })

        // Update conversation timestamp
        await db
            .update(feynmanConversations)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(feynmanConversations.id, conversationId))

        // Return all messages
        const allMessages = await db
            .select()
            .from(feynmanMessages)
            .where(eq(feynmanMessages.conversationId, conversationId))
            .orderBy(asc(feynmanMessages.createdAt))

        res.json({ messages: allMessages })
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error in feynman follow-up:', message)
        res.status(500).json({ error: 'AI 追问失败' })
    }
})

// GET conversation messages for a feynman card
feynmanRouter.get('/:id/messages', async (req: Request, res: Response) => {
    try {
        const id = parseCardId(req.params.id)
        if (id === -1) {
            res.status(400).json({ error: '无效的卡片 ID' })
            return
        }

        const conv = await db
            .select()
            .from(feynmanConversations)
            .where(eq(feynmanConversations.feynmanCardId, id))
            .limit(1)

        if (!conv[0]) {
            res.json([])
            return
        }

        const messages = await db
            .select()
            .from(feynmanMessages)
            .where(eq(feynmanMessages.conversationId, conv[0].id))
            .orderBy(asc(feynmanMessages.createdAt))

        res.json(messages)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('Error getting feynman messages:', message)
        res.status(500).json({ error: '获取对话消息失败' })
    }
})
