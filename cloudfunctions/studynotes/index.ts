import type { ChatMessage, StudynotesRow } from '../common/types'
import { safeJsonParse } from '../common/ai/client'
import {
    evaluateStudynotesReflection,
    studynotesFollowUpChat,
} from '../common/ai/studynotes'
import { studynotesSubjectValues } from '../common/constants'
import { query, execute, insertAndGetId, queryOne } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'

interface StudynotesEvent {
    token?: string
    childId?: number
    action:
        | 'list'
        | 'get'
        | 'create'
        | 'update'
        | 'delete'
        | 'evaluate'
        | 'follow-up'
        | 'messages'
    id?: number
    subject?: string
    topic?: string
    summary?: string
    example?: string
    stuckPoints?: string
    memoryHook?: string
    search?: string
    message?: string
}

const VALID_SUBJECTS = new Set<string>(studynotesSubjectValues)

function parseCardId(raw: unknown): number {
    const id = Number(raw)
    return Number.isInteger(id) && id > 0 ? id : -1
}

export async function main(event: StudynotesEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const { subject, search, page, pageSize } = event
            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (subject && VALID_SUBJECTS.has(subject)) {
                where.push('subject = ?')
                params.push(subject)
            }
            if (search && search.trim()) {
                const kw = `%${search.trim()}%`
                where.push('(topic LIKE ? OR summary LIKE ? OR example LIKE ? OR stuck_points LIKE ?)')
                params.push(kw, kw, kw, kw)
            }
            const limit = Math.min(200, Math.max(1, Number(pageSize) || 50))
            const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit)
            const cards = await query<StudynotesRow>(
                `SELECT * FROM studynotes WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset],
            )

            const convCounts = await query<{ cardId: number; count: number }>(
                `SELECT sc.studynote_id AS cardId, COUNT(*) AS count
         FROM studynote_conversations sc
         INNER JOIN studynote_messages sm ON sm.conversation_id = sc.id
         WHERE sm.role = 'assistant' AND sc.user_id = ?
         GROUP BY sc.studynote_id`,
                [ctx.targetUserId ?? ctx.auth.userId],
            )
            const countMap = new Map<number, number>()
            for (const c of convCounts) countMap.set(c.cardId, c.count)

            const result = cards.map((card) => ({
                ...card,
                followUpCount: countMap.get(card.id) ?? 0,
            }))

            return { items: result, page: offset / limit + 1, pageSize: limit }
        }

        if (action === 'get') {
            const id = parseCardId(event.id)
            if (id === -1) throw new HttpError(400, '无效的心得 ID')
            const rows = await query<StudynotesRow>(
                `SELECT * FROM studynotes WHERE id = ? AND (${ctx.userFilter})`,
                [id],
            )
            if (rows.length === 0) throw new HttpError(404, '学习心得未找到')
            return rows[0]
        }

        if (action === 'create') {
            const userId = requireTargetUser(ctx)
            const { subject, topic, summary, example, stuckPoints, memoryHook } = event
            if (
                typeof subject !== 'string' ||
                typeof summary !== 'string' ||
                typeof example !== 'string' ||
                typeof stuckPoints !== 'string' ||
                !subject.trim() ||
                !summary.trim() ||
                !example.trim()
            ) {
                throw new HttpError(400, '学科、概括、例子为必填项')
            }
            if (!VALID_SUBJECTS.has(subject)) {
                throw new HttpError(400, '无效的学科')
            }
            const id = await insertAndGetId(
                `INSERT INTO studynotes
         (user_id, subject, topic, summary, example, stuck_points, memory_hook)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId,
                    subject,
                    topic || '',
                    summary,
                    example,
                    stuckPoints,
                    memoryHook || null,
                ],
            )
            const rows = await query<StudynotesRow>('SELECT * FROM studynotes WHERE id = ?', [id])
            return rows[0]
        }

        if (action === 'update') {
            const userId = requireTargetUser(ctx)
            const id = parseCardId(event.id)
            if (id === -1) throw new HttpError(400, '无效的心得 ID')
            const { subject, topic, summary, example, stuckPoints, memoryHook } = event
            if (
                subject === undefined &&
                topic === undefined &&
                summary === undefined &&
                example === undefined &&
                stuckPoints === undefined &&
                memoryHook === undefined
            ) {
                throw new HttpError(400, '请提供至少一个要更新的字段')
            }
            if (subject !== undefined && !VALID_SUBJECTS.has(subject)) {
                throw new HttpError(400, '无效的学科')
            }
            const sets: string[] = []
            const params: unknown[] = []
            if (subject !== undefined) {
                sets.push('subject = ?')
                params.push(subject)
            }
            if (topic !== undefined) {
                sets.push('topic = ?')
                params.push(topic)
            }
            if (summary !== undefined) {
                sets.push('summary = ?')
                params.push(summary)
            }
            if (example !== undefined) {
                sets.push('example = ?')
                params.push(example)
            }
            if (stuckPoints !== undefined) {
                sets.push('stuck_points = ?')
                params.push(stuckPoints)
            }
            if (memoryHook !== undefined) {
                sets.push('memory_hook = ?')
                params.push(memoryHook)
            }
            sets.push('updated_at = ?')
            params.push(new Date().toISOString())
            params.push(id, userId)
            await execute(
                `UPDATE studynotes SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
                params,
            )
            const rows = await query<StudynotesRow>('SELECT * FROM studynotes WHERE id = ?', [id])
            if (rows.length === 0) throw new HttpError(404, '学习心得未找到')
            return rows[0]
        }

        if (action === 'delete') {
            const userId = requireTargetUser(ctx)
            const id = parseCardId(event.id)
            if (id === -1) throw new HttpError(400, '无效的心得 ID')
            const result = await execute(
                'DELETE FROM studynotes WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (result.affectedRows === 0) throw new HttpError(404, '学习心得未找到')
            return { success: true }
        }

        if (action === 'evaluate') {
            const userId = requireTargetUser(ctx)
            const id = parseCardId(event.id)
            if (id === -1) throw new HttpError(400, '无效的心得 ID')
            const rows = await query<StudynotesRow>(
                'SELECT * FROM studynotes WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (rows.length === 0) throw new HttpError(404, '学习心得未找到')
            const card = rows[0]
            const evaluationRaw = await evaluateStudynotesReflection(
                card.subject,
                card.topic,
                card.summary,
                card.example,
                card.stuck_points,
                { userId },
            )
            const evaluation = safeJsonParse<Record<string, unknown>>(evaluationRaw, {})
            const now = new Date().toISOString()
            await execute(
                'UPDATE studynotes SET evaluation = ?, evaluated_at = ?, updated_at = ? WHERE id = ?',
                [evaluationRaw, now, now, id],
            )
            return { evaluation, evaluatedAt: now }
        }

        if (action === 'follow-up' || action === 'messages') {
            const userId = requireTargetUser(ctx)
            const id = parseCardId(event.id)
            if (id === -1) throw new HttpError(400, '无效的心得 ID')
            const rows = await query<StudynotesRow>(
                'SELECT * FROM studynotes WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (rows.length === 0) throw new HttpError(404, '学习心得未找到')
            const card = rows[0]

            let conv = await queryOne<{ id: number }>(
                'SELECT id FROM studynote_conversations WHERE studynote_id = ?',
                [id],
            )
            const userMessage = event.message ? event.message.trim() : ''
            const isRestart = action === 'follow-up' && !userMessage && !!conv

            if (isRestart && conv) {
                await execute('DELETE FROM studynote_messages WHERE conversation_id = ?', [
                    conv.id,
                ])
            } else if (!conv) {
                conv = {
                    id: await insertAndGetId(
                        'INSERT INTO studynote_conversations (studynote_id, user_id) VALUES (?, ?)',
                        [id, userId],
                    ),
                }
            }

            if (action === 'follow-up') {
                if (userMessage) {
                    await execute(
                        "INSERT INTO studynote_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'user', ?)",
                        [conv.id, userId, userMessage],
                    )
                }
                const prev = await query<{ role: string; content: string }>(
                    'SELECT role, content FROM studynote_messages WHERE conversation_id = ? ORDER BY id ASC',
                    [conv.id],
                )
                const prevMessages: ChatMessage[] = prev.map((m) => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                }))
                const aiReply = await studynotesFollowUpChat(
                    card.subject,
                    card.topic,
                    card.summary,
                    card.example,
                    card.stuck_points,
                    prevMessages,
                    userMessage || undefined,
                    { userId },
                )
                if (aiReply.startsWith('测验出错：') || aiReply.startsWith('追问出错：')) {
                    throw new HttpError(500, aiReply)
                }
                await execute(
                    "INSERT INTO studynote_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
                    [conv.id, userId, aiReply],
                )
                const scoreMatch = aiReply.match(/掌握程度评分[^0-9]*(\d+)/)
                if (scoreMatch) {
                    const score = Number.parseInt(scoreMatch[1], 10)
                    if (!Number.isNaN(score) && score >= 0 && score <= 100) {
                        await execute(
                            'UPDATE studynotes SET follow_up_score = ?, updated_at = ? WHERE id = ?',
                            [score, new Date().toISOString(), id],
                        )
                    }
                }
                await execute(
                    'UPDATE studynote_conversations SET updated_at = ? WHERE id = ?',
                    [new Date().toISOString(), conv.id],
                )
            }

            const messages = await query<{ role: string; content: string }>(
                'SELECT role, content FROM studynote_messages WHERE conversation_id = ? ORDER BY id ASC',
                [conv.id],
            )
            return { messages }
        }

        throw new HttpError(400, '未知的 action')
    })
}
