import { run } from '../common/entry'
import { query, execute, insertAndGetId, queryOne } from '../common/db'
import { getAuthContext, requireTargetUser } from '../common/db-query'
import { HttpError } from '../common/errors'
import { pointsForHomeworkGrade, loadRules } from '../common/rules'
import { recomputeMonthSummary } from '../common/summary-helper'
import { safeJsonParse } from '../common/ai/client'
import {
    generateTaskTitle,
    generateTitle,
    scoreComposition,
    generateDemoSubmission,
    chatAboutTask,
} from '../common/ai/task'
import type {
    AIScoreResult,
    ChatMessage,
    SubmissionRow,
    TaskGrade,
    TaskRow,
    TaskStatus,
    TaskType,
} from '../common/types'
import { defaultGradeValues, taskStatus, taskTypeValues } from '../common/constants'

interface TasksEvent {
    token?: string
    childId?: number
    action: string
    id?: number
    title?: string
    type?: string
    status?: string
    content?: string
    message?: string
    grade?: number
}

function parseTaskId(id: unknown): number | null {
    const taskId = Number(id)
    return Number.isInteger(taskId) && taskId > 0 ? taskId : null
}

function isValidEnum<T extends string>(
    value: unknown,
    validValues: readonly T[],
): value is T {
    return typeof value === 'string' && validValues.includes(value as T)
}

async function fetchOwnedTask(
    taskId: number,
    userId: number,
): Promise<TaskRow> {
    const rows = await query<TaskRow>(
        'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
        [taskId, userId],
    )
    if (rows.length === 0) {
        throw new HttpError(404, '作业不存在')
    }
    return rows[0]
}

async function fetchSubmission(taskId: number): Promise<SubmissionRow | null> {
    const rows = await query<SubmissionRow>(
        'SELECT * FROM submissions WHERE task_id = ?',
        [taskId],
    )
    return rows[0] ?? null
}

/** 获取或创建作业对话（按 task_id 唯一），返回对话 id */
async function getOrCreateConversation(
    taskId: number,
    userId: number,
): Promise<number> {
    const existing = await queryOne<{ id: number }>(
        'SELECT id FROM task_conversations WHERE task_id = ?',
        [taskId],
    )
    if (existing) return existing.id
    return insertAndGetId(
        'INSERT INTO task_conversations (task_id, user_id) VALUES (?, ?)',
        [taskId, userId],
    )
}

async function deleteOldPoints(submissionId: number, userId: number) {
    await execute(
        `DELETE FROM point_records
     WHERE related_id = ? AND related_type = 'submission' AND user_id = ?`,
        [submissionId, userId],
    )
}

async function recordPoints(
    gradeValue: string,
    submissionId: number,
    userId: number,
): Promise<number> {
    try {
        const rules = await loadRules()
        const points = pointsForHomeworkGrade(rules, gradeValue)
        if (points !== 0) {
            await execute(
                `INSERT INTO point_records
         (user_id, type, amount, reason, rule_name, related_id, related_type)
         VALUES (?, ?, ?, ?, 'gradingScale.homework', ?, 'submission')`,
                [
                    userId,
                    points > 0 ? 'earn' : 'deduct',
                    Math.abs(points),
                    `作业AI评分 ${gradeValue}`,
                    submissionId,
                ],
            )
            await recomputeMonthSummary(userId, new Date().toISOString().slice(0, 7))
        }
        return points
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('记录积分失败:', msg)
        return 0
    }
}

export async function main(event: TasksEvent): Promise<unknown> {
    return run(async () => {
        const ctx = await getAuthContext(event)
        const userId = requireTargetUser(ctx)
        const { action } = event

        if (action === 'list') {
            const rawStatus = event.status
            const rawType = event.type
            const status: TaskStatus | undefined =
                rawStatus && isValidEnum(rawStatus, taskStatus)
                    ? rawStatus
                    : undefined
            const type: TaskType | undefined =
                rawType && isValidEnum(rawType, taskTypeValues)
                    ? (rawType as TaskType)
                    : undefined

            const where: string[] = [`(${ctx.userFilter})`]
            const params: unknown[] = []
            if (status) {
                where.push('status = ?')
                params.push(status)
            }
            if (type) {
                where.push('type = ?')
                params.push(type)
            }

            const taskRows = await query<TaskRow>(
                `SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
                params,
            )
            const taskIds = taskRows.map((t) => t.id)
            if (taskIds.length === 0) {
                return []
            }

            const subs = await query<SubmissionRow>(
                `SELECT * FROM submissions WHERE task_id IN (?)`,
                [taskIds],
            )
            const subMap = new Map<number, SubmissionRow>()
            for (const s of subs) subMap.set(s.task_id, s)

            const subIds = subs.map((s) => s.id)
            const points =
                subIds.length > 0
                    ? await query<{
                          related_id: number
                          type: string
                          amount: number
                      }>(
                          `SELECT related_id, type, amount FROM point_records
             WHERE related_type = 'submission' AND related_id IN (?)`,
                          [subIds],
                      )
                    : []
            const pointMap = new Map<number, { type: string; amount: number }>()
            for (const p of points) {
                pointMap.set(p.related_id, { type: p.type, amount: p.amount })
            }

            return taskRows.map((task) => {
                const sub = subMap.get(task.id) ?? undefined
                let pointsEarned: number | null = null
                if (sub) {
                    const latest = pointMap.get(sub.id)
                    if (latest) {
                        pointsEarned =
                            latest.type === 'earn' ? latest.amount : -latest.amount
                    }
                }
                const aiScoreData = safeJsonParse<{
                    comment?: string | null
                    suggestions?: string[]
                }>(sub?.ai_score ?? null, { comment: null, suggestions: [] })

                return {
                    ...task,
                    userId: task.user_id,
                    submission: sub
                        ? {
                              id: sub.id,
                              content: sub.content,
                              grade: sub.grade,
                              aiScore: sub.ai_score,
                              scoredAt: sub.scored_at,
                              createdAt: sub.created_at,
                          }
                        : null,
                    aiComment: aiScoreData.comment ?? null,
                    submittedAt: sub?.created_at ?? null,
                    gradedAt: sub?.scored_at ?? null,
                    pointsEarned,
                    aiSuggestions: aiScoreData.suggestions ?? [],
                }
            })
        }

        if (action === 'create') {
            if (!event.title || !event.type) {
                throw new HttpError(400, 'title 和 type 为必填项')
            }
            if (!isValidEnum(event.type, taskTypeValues)) {
                throw new HttpError(400, '无效的作业类型')
            }
            const id = await insertAndGetId(
                'INSERT INTO tasks (user_id, title, type) VALUES (?, ?, ?)',
                [userId, event.title, event.type],
            )
            const rows = await query<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id])
            return rows[0]
        }

        if (action === 'update') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            const task = await fetchOwnedTask(taskId, userId)
            const sets: string[] = []
            const params: unknown[] = []
            if (event.title) {
                sets.push('title = ?')
                params.push(event.title)
            }
            if (event.type && isValidEnum(event.type, taskTypeValues)) {
                sets.push('type = ?')
                params.push(event.type)
            }
            if (event.status && isValidEnum(event.status, taskStatus)) {
                sets.push('status = ?')
                params.push(event.status)
            }
            if (sets.length === 0) return task
            params.push(taskId, userId)
            await execute(
                `UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
                params,
            )
            const rows = await query<TaskRow>('SELECT * FROM tasks WHERE id = ?', [taskId])
            return rows[0]
        }

        if (action === 'delete') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            await fetchOwnedTask(taskId, userId)
            const subs = await query<{ id: number }>(
                'SELECT id FROM submissions WHERE task_id = ?',
                [taskId],
            )
            const subIds = subs.map((s) => s.id)
            if (subIds.length > 0) {
                await execute(
                    `DELETE FROM point_records
           WHERE related_type = 'submission' AND related_id IN (?) AND user_id = ?`,
                    [subIds, userId],
                )
            }
            await execute('DELETE FROM ai_score_logs WHERE task_id = ?', [taskId])
            await execute('DELETE FROM submissions WHERE task_id = ?', [taskId])
            await execute(
                'DELETE FROM tasks WHERE id = ? AND user_id = ?',
                [taskId, userId],
            )
            return { success: true }
        }

        if (action === 'submit') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            if (!event.content) throw new HttpError(400, 'content 为必填项')
            await fetchOwnedTask(taskId, userId)

            const existing = await fetchSubmission(taskId)
            let submission: SubmissionRow
            if (existing) {
                await execute('UPDATE submissions SET content = ? WHERE id = ?', [
                    event.content,
                    existing.id,
                ])
                const rows = await query<SubmissionRow>(
                    'SELECT * FROM submissions WHERE id = ?',
                    [existing.id],
                )
                submission = rows[0]
            } else {
                const id = await insertAndGetId(
                    'INSERT INTO submissions (task_id, user_id, content) VALUES (?, ?, ?)',
                    [taskId, userId, event.content],
                )
                await execute(
                    "UPDATE tasks SET status = 'completed' WHERE id = ?",
                    [taskId],
                )
                const rows = await query<SubmissionRow>(
                    'SELECT * FROM submissions WHERE id = ?',
                    [id],
                )
                submission = rows[0]
            }
            return { submission }
        }

        if (action === 'ai-title') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            const task = await fetchOwnedTask(taskId, userId)
            const submission = await fetchSubmission(taskId)
            if (!submission || !submission.content) {
                throw new HttpError(400, '暂无可生成标题的提交内容')
            }
            const title = await generateTitle(submission.content, task.type, {
                userId,
                taskId,
            })
            await execute('UPDATE tasks SET title = ? WHERE id = ?', [title, taskId])
            return { title }
        }

        if (action === 'ai-generate-title') {
            if (!event.type || event.grade == null) {
                throw new HttpError(400, 'type 和 grade 为必填项')
            }
            if (!isValidEnum(event.type, taskTypeValues)) {
                throw new HttpError(400, '无效的作业类型')
            }
            const title = await generateTaskTitle(event.type, Number(event.grade), {
                userId,
            })
            return { title }
        }

        if (action === 'ai-score') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            const task = await fetchOwnedTask(taskId, userId)
            const submission = await fetchSubmission(taskId)
            if (!submission) {
                throw new HttpError(404, '尚未提交作业，请先提交')
            }

            const aiResult: AIScoreResult = await scoreComposition(
                submission.content,
                task.type,
                task.title,
                { userId, taskId },
            )

            await deleteOldPoints(submission.id, userId)
            await execute(
                `UPDATE submissions SET grade = ?, ai_score = ?, scored_at = ? WHERE id = ?`,
                [
                    aiResult.grade,
                    JSON.stringify(aiResult),
                    new Date().toISOString(),
                    submission.id,
                ],
            )
            await execute(
                `INSERT INTO ai_score_logs
         (task_id, submission_id, user_id, content, grade, ai_score, scored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    taskId,
                    submission.id,
                    userId,
                    submission.content,
                    aiResult.grade,
                    JSON.stringify(aiResult),
                    new Date().toISOString(),
                ],
            )

            const points = await recordPoints(aiResult.grade, submission.id, userId)

            return {
                submission: {
                    ...submission,
                    grade: aiResult.grade,
                    aiScore: JSON.stringify(aiResult),
                    scoredAt: new Date().toISOString(),
                },
                aiResult,
                pointsEarned: points,
            }
        }

        if (action === 'ai-score-logs') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            await fetchOwnedTask(taskId, userId)
            const logs = await query<{
                id: number
                task_id: number
                submission_id: number
                grade: TaskGrade | null
                ai_score: string
                scored_at: string
                created_at: string
            }>(
                'SELECT * FROM ai_score_logs WHERE task_id = ? ORDER BY created_at DESC',
                [taskId],
            )
            return logs
        }

        if (action === 'ai-demo') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            const task = await fetchOwnedTask(taskId, userId)
            const submission = await fetchSubmission(taskId)
            const content = submission?.content ?? ''
            const demo = await generateDemoSubmission(content, task.type, task.title, {
                userId,
                taskId,
            })

            const convId = await getOrCreateConversation(taskId, userId)
            await execute(
                "INSERT INTO task_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
                [convId, userId, demo],
            )
            await execute(
                'UPDATE task_conversations SET updated_at = ? WHERE id = ?',
                [new Date().toISOString(), convId],
            )
            return { demo }
        }

        if (action === 'ai-chat') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            if (!event.message) throw new HttpError(400, 'message 为必填项')
            const task = await fetchOwnedTask(taskId, userId)

            const convId = await getOrCreateConversation(taskId, userId)
            await execute(
                "INSERT INTO task_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'user', ?)",
                [convId, userId, event.message],
            )

            const msgs = await query<{ role: string; content: string }>(
                'SELECT role, content FROM task_messages WHERE conversation_id = ? ORDER BY id ASC',
                [convId],
            )
            const contextMessages: ChatMessage[] = msgs.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }))

            const submission = await fetchSubmission(taskId)
            const reply = await chatAboutTask(
                submission?.content ?? '',
                task.type,
                task.title,
                contextMessages,
                { userId, taskId },
            )

            await execute(
                "INSERT INTO task_messages (conversation_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)",
                [convId, userId, reply],
            )
            await execute(
                'UPDATE task_conversations SET updated_at = ? WHERE id = ?',
                [new Date().toISOString(), convId],
            )
            return { reply }
        }

        if (action === 'conversation') {
            const taskId = parseTaskId(event.id)
            if (taskId === null) throw new HttpError(400, '无效的作业 id')
            await fetchOwnedTask(taskId, userId)
            const conv = await queryOne<{ id: number }>(
                'SELECT id FROM task_conversations WHERE task_id = ?',
                [taskId],
            )
            if (!conv) {
                return { conversation: null, messages: [] }
            }
            const messages = await query<{ role: string; content: string }>(
                'SELECT role, content FROM task_messages WHERE conversation_id = ? ORDER BY id ASC',
                [conv.id],
            )
            return { conversation: conv, messages }
        }

        throw new HttpError(400, '未知的 action')
    })
}
