import type { ChatMessage, WeeklyReportRow } from '../common/types'
import { analyzeWeeklyReport, chatAboutWeeklyReport } from '../common/ai/weekly'
import { DEFAULT_WEEKLY_AI_HELPER } from '../common/constants'
import { query, execute, insertAndGetId, queryOne } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { run } from '../common/entry'
import { HttpError } from '../common/errors'
import { parseContent, stringifyContent } from '../common/weekly-content'

interface WeeklyEvent {
    token?: string
    childId?: number
    action: 'list' | 'create' | 'update' | 'delete' | 'analyze' | 'conversation' | 'chat'
    id?: number
    year?: number
    weekNumber?: number
    content?: Record<string, string>
    message?: string
    page?: number
    pageSize?: number
}

async function loadStudentGrade(userId: number): Promise<string> {
    const row = await queryOne<{ grade: string }>(
        'SELECT grade FROM family_bindings WHERE child_id = ? AND is_active = 1',
        [userId],
    )
    return row?.grade || ''
}

export async function main(event: WeeklyEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const { action } = event

        if (action === 'list') {
            const { year, page, pageSize } = event
            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (year) {
                where.push('year = ?')
                params.push(year)
            }
            const limit = Math.min(200, Math.max(1, Number(pageSize) || 50))
            const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit)
            const reports = await query<WeeklyReportRow>(
                `SELECT * FROM weekly_reports WHERE ${where.join(' AND ')} ORDER BY year DESC, week_number DESC LIMIT ? OFFSET ?`,
                [...params, limit, offset],
            )
            return { items: reports, page: offset / limit + 1, pageSize: limit }
        }

        if (action === 'create') {
            const userId = requireTargetUser(ctx)
            const { weekNumber, year, content } = event
            if (!weekNumber || !year || !content) {
                throw new HttpError(400, '缺少必要字段：weekNumber, year, content')
            }
            const id = await insertAndGetId(
                'INSERT INTO weekly_reports (user_id, week_number, year, content) VALUES (?, ?, ?, ?)',
                [userId, weekNumber, year, stringifyContent(content as never)],
            )
            const rows = await query<WeeklyReportRow>('SELECT * FROM weekly_reports WHERE id = ?', [id])
            return rows[0]
        }

        if (action === 'update') {
            const userId = requireTargetUser(ctx)
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的周报 id')
            }
            if (!event.content) {
                throw new HttpError(400, '缺少必要字段：content')
            }
            const rows = await query<WeeklyReportRow>(
                'SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (rows.length === 0) throw new HttpError(404, '周报不存在')
            await execute(
                'UPDATE weekly_reports SET content = ?, updated_at = ? WHERE id = ? AND user_id = ?',
                [stringifyContent(event.content as never), new Date().toISOString(), id, userId],
            )
            const updated = await query<WeeklyReportRow>('SELECT * FROM weekly_reports WHERE id = ?', [id])
            return updated[0]
        }

        if (action === 'delete') {
            const userId = requireTargetUser(ctx)
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的周报 id')
            }
            await execute(
                'DELETE FROM weekly_reports WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            return { success: true }
        }

        if (action === 'analyze') {
            const userId = requireTargetUser(ctx)
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的周报 id')
            }
            const rows = await query<WeeklyReportRow>(
                'SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (rows.length === 0) throw new HttpError(404, '周报不存在')
            const report = rows[0]
            const content = parseContent(report.content)
            const weekLabel = `${report.year}年${report.week_number}周`
            const analysis = await analyzeWeeklyReport(content, {
                userId,
                weekLabel,
                teacherName: DEFAULT_WEEKLY_AI_HELPER,
                studentGrade: await loadStudentGrade(userId),
            })
            await execute(
                'UPDATE weekly_reports SET analysis = ?, updated_at = ? WHERE id = ?',
                [JSON.stringify(analysis), new Date().toISOString(), id],
            )
            const conv = await queryOne<{ id: number }>(
                'SELECT id FROM weekly_conversations WHERE weekly_report_id = ?',
                [id],
            )
            if (!conv) {
                const convId = await insertAndGetId(
                    'INSERT INTO weekly_conversations (weekly_report_id, user_id) VALUES (?, ?)',
                    [id, userId],
                )
                await execute(
                    "INSERT INTO weekly_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
                    [convId, userId, analysis.summary],
                )
            }
            return { analysis }
        }

        if (action === 'conversation') {
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的周报 id')
            }
            const conv = await queryOne<{ id: number }>(
                'SELECT id FROM weekly_conversations WHERE weekly_report_id = ?',
                [id],
            )
            if (!conv) return { conversation: null, messages: [] }
            const messages = await query<{ role: string; content: string }>(
                'SELECT role, content FROM weekly_messages WHERE conversation_id = ? ORDER BY id ASC',
                [conv.id],
            )
            return { conversation: conv, messages }
        }

        if (action === 'chat') {
            const userId = requireTargetUser(ctx)
            const id = Number(event.id)
            if (!Number.isInteger(id) || id <= 0) {
                throw new HttpError(400, '无效的周报 id')
            }
            if (!event.message || !event.message.trim()) {
                throw new HttpError(400, '消息不能为空')
            }
            const rows = await query<WeeklyReportRow>(
                'SELECT * FROM weekly_reports WHERE id = ? AND user_id = ?',
                [id, userId],
            )
            if (rows.length === 0) throw new HttpError(404, '周报不存在')

            let conv = await queryOne<{ id: number }>(
                'SELECT id FROM weekly_conversations WHERE weekly_report_id = ?',
                [id],
            )
            if (!conv) {
                conv = {
                    id: await insertAndGetId(
                        'INSERT INTO weekly_conversations (weekly_report_id, user_id) VALUES (?, ?)',
                        [id, userId],
                    ),
                }
            }
            await execute(
                "INSERT INTO weekly_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'user', ?)",
                [conv.id, userId, event.message],
            )
            const msgs = await query<{ role: string; content: string }>(
                'SELECT role, content FROM weekly_messages WHERE conversation_id = ? ORDER BY id ASC',
                [conv.id],
            )
            const contextMessages: ChatMessage[] = msgs.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }))
            const report = rows[0]
            const content = parseContent(report.content)
            const weekLabel = `${report.year}年${report.week_number}周`
            const reply = await chatAboutWeeklyReport(content, contextMessages, {
                userId,
                weekLabel,
                teacherName: DEFAULT_WEEKLY_AI_HELPER,
                studentGrade: await loadStudentGrade(userId),
            })
            await execute(
                "INSERT INTO weekly_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
                [conv.id, userId, reply],
            )
            await execute(
                'UPDATE weekly_conversations SET updated_at = ? WHERE id = ?',
                [new Date().toISOString(), conv.id],
            )
            return { reply }
        }

        throw new HttpError(400, '未知的 action')
    })
}
