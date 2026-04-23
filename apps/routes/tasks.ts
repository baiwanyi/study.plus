import { Router, type Request, type Response } from 'express'
import { db } from '@apps/db/index'
import { tasks, submissions, pointRecords } from '@apps/db/schema'
import { eq, desc, and, inArray } from 'drizzle-orm'
import {
    scoreComposition,
    generateTitle,
    generateTaskTitle,
} from '@apps/services/ai'
import { getPointsForGrade } from '@apps/services/points'
import { loadRules } from '@apps/routes/rules-loader'
import { recomputeMonthSummary } from '@apps/routes/summary-helper'
import type {
    Task,
    Submission,
    CreateTaskRequest,
    UpdateTaskRequest,
    SubmitTaskRequest,
    SubmitTaskResponse,
    TaskType,
    TaskStatus,
    ApiErrorResponse,
    ApiSuccessResponse,
} from '@apps/lib/types'
import { toTaskType, taskStatus, taskTypeValues } from '@apps/lib/utils'

const router = Router()

// Helper: delete old point records for a submission (for re-scoring)
async function deleteOldPoints(submissionId: number) {
    await db
        .delete(pointRecords)
        .where(
            and(
                eq(pointRecords.relatedId, submissionId),
                eq(pointRecords.relatedType, 'submission'),
            ),
        )
}

// Helper: safely parse JSON with fallback
function safeJsonParse<T>(json: string | null, fallback: T): T {
    if (!json) return fallback
    try {
        return JSON.parse(json) as T
    } catch {
        return fallback
    }
}

// Helper: validate task id parameter
function parseTaskId(id: string): number | null {
    const taskId = Number(id)
    return Number.isInteger(taskId) && taskId > 0 ? taskId : null
}

// Helper: fetch task by id with 404 handling
async function fetchTaskById(taskId: number): Promise<Task | null> {
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId))
    return (rows[0] as Task) ?? null
}

// Helper: fetch submission by task id
async function fetchSubmissionByTaskId(taskId: number): Promise<Submission | null> {
    const rows = await db.select().from(submissions).where(eq(submissions.taskId, taskId))
    return (rows[0] as Submission) ?? null
}

// Helper: validate enum value
function isValidEnum<T extends string>(value: unknown, validValues: readonly T[]): value is T {
    return typeof value === 'string' && validValues.includes(value as T)
}

// Helper: record points for a submission with error handling
async function recordPoints(
    gradeValue: string,
    submissionId: number,
    suffix: string,
): Promise<number> {
    try {
        const rules = await loadRules()
        const points = getPointsForGrade(rules, gradeValue)
        if (points !== 0) {
            await db.insert(pointRecords).values({
                type: points > 0 ? 'earn' : 'deduct',
                amount: Math.abs(points),
                reason: `作业${suffix} ${gradeValue}`,
                ruleName: 'gradingScale.homework',
                relatedId: submissionId,
                relatedType: 'submission',
            })
            // Sync month summary
            await recomputeMonthSummary(new Date().toISOString().slice(0, 7))
        }
        return points
    } catch (err) {
        console.error('Failed to record points:', err)
        return 0
    }
}

// Get all tasks (with submission info)
router.get('/', async (req: Request, res: Response) => {
    // Validate query parameters against valid enums
    const rawStatus = req.query.status as string | undefined
    const rawType = req.query.type as string | undefined

    const status: TaskStatus | undefined = rawStatus && isValidEnum(rawStatus, taskStatus)
        ? rawStatus
        : undefined
    const type: TaskType | undefined = rawType && isValidEnum(rawType, ['composition', 'mindmap', 'notes'] as const)
        ? (rawType as TaskType)
        : undefined

    let taskRows: Task[]
    if (status) {
        taskRows = (await db
            .select()
            .from(tasks)
            .where(eq(tasks.status, status))
            .orderBy(desc(tasks.createdAt))) as Task[]
    } else if (type) {
        taskRows = (await db
            .select()
            .from(tasks)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .where(eq(tasks.type, type as any))
            .orderBy(desc(tasks.createdAt))) as Task[]
    } else {
        taskRows = (await db
            .select()
            .from(tasks)
            .orderBy(desc(tasks.createdAt))) as Task[]
    }

    // Batch-fetch submissions and point records to avoid N+1 queries
    const taskIds = taskRows.map((t) => t.id)

    const allSubs =
        taskIds.length > 0
            ? await db
                  .select()
                  .from(submissions)
                  .where(
                      taskIds.length === 1
                          ? eq(submissions.taskId, taskIds[0])
                          : inArray(submissions.taskId, taskIds),
                  )
            : []
    const subMap = new Map<number, Submission>()
    for (const s of allSubs) {
        subMap.set((s as Submission).taskId, s as Submission)
    }

    const subIds = allSubs.map((s) => (s as Submission).id)
    const allPoints =
        subIds.length > 0
            ? await db
                  .select()
                  .from(pointRecords)
                  .where(
                      and(
                          eq(pointRecords.relatedType, 'submission'),
                          subIds.length === 1
                              ? eq(pointRecords.relatedId, subIds[0])
                              : inArray(pointRecords.relatedId, subIds),
                      ),
                  )
            : []
    const pointMap = new Map<number, { type: string; amount: number }>()
    for (const p of allPoints) {
        // Keep the latest point record per submission (last one wins)
        if (p.relatedId != null) {
            pointMap.set(p.relatedId, { type: p.type, amount: p.amount })
        }
    }

    const result = taskRows.map((task) => {
        const sub = subMap.get(task.id) ?? undefined

        let pointsEarned: number | null = null
        if (sub) {
            const latest = pointMap.get(sub.id)
            if (latest) {
                pointsEarned =
                    latest.type === 'earn' ? latest.amount : -latest.amount
            }
        }

        // Parse aiScore once and reuse
        const aiScoreData = safeJsonParse<{ comment?: string | null; suggestions?: string[] }>(
            sub?.aiScore ?? null,
            { comment: null, suggestions: [] }
        )

        return {
            ...task,
            submission: sub
                ? {
                      id: sub.id,
                      content: sub.content,
                      grade: sub.grade,
                      aiScore: sub.aiScore,
                      scoredAt: sub.scoredAt,
                      createdAt: sub.createdAt,
                  }
                : null,
            aiComment: aiScoreData.comment ?? null,
            submittedAt: sub?.createdAt ?? null,
            gradedAt: sub?.scoredAt ?? null,
            pointsEarned,
            aiSuggestions: aiScoreData.suggestions ?? [],
        }
    })

    res.json(result)
})

// Create a task
router.post(
    '/',
    async (
        req: Request<{}, Task | ApiErrorResponse, CreateTaskRequest>,
        res: Response<Task | ApiErrorResponse>,
    ) => {
        const { title, type }: CreateTaskRequest = req.body
        if (!title || !type) {
            res.status(400).json({ error: 'title and type are required' })
            return
        }
        // Validate type against allowed values
        if (!isValidEnum(type, taskTypeValues)) {
            res.status(400).json({ error: 'Invalid task type' })
            return
        }
        const result = await db
            .insert(tasks)
            .values({ title, type })
            .returning()
        res.json(result[0] as Task)
    },
)

// Update a task
router.put(
    '/:id',
    async (
        req: Request<
            { id: string },
            Task | ApiErrorResponse,
            UpdateTaskRequest
        >,
        res: Response<Task | ApiErrorResponse>,
    ) => {
        const taskId = parseTaskId(req.params.id)
        if (taskId === null) {
            res.status(400).json({ error: 'Invalid task id' })
            return
        }
        const { title, type, status }: UpdateTaskRequest = req.body

        // Validate type and status against valid enums
        if (type && !isValidEnum(type, ['composition', 'mindmap', 'notes'] as const)) {
            res.status(400).json({ error: 'Invalid task type' })
            return
        }
        if (status && !isValidEnum(status, ['pending', 'completed', 'expired'] as const)) {
            res.status(400).json({ error: 'Invalid task status' })
            return
        }

        // Build update object with validated fields
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: any = {}
        if (title) updateData.title = title
        if (type) updateData.type = type
        if (status) updateData.status = status

        const result = await db
            .update(tasks)
            .set(updateData)
            .where(eq(tasks.id, taskId))
            .returning()
        if (!result[0]) {
            res.status(404).json({ error: 'Task not found' })
            return
        }
        res.json(result[0] as Task)
    },
)

// Delete a task
router.delete(
    '/:id',
    async (
        req: Request<{ id: string }>,
        res: Response<ApiSuccessResponse | ApiErrorResponse>,
    ) => {
        const taskId = parseTaskId(req.params.id)
        if (taskId === null) {
            res.status(400).json({ error: 'Invalid task id' })
            return
        }
        await db.delete(tasks).where(eq(tasks.id, taskId))
        res.json({ success: true })
    },
)

// Submit work for a task (save/overwrite content)
router.post(
    '/:id/submit',
    async (
        req: Request<
            { id: string },
            { submission: Submission } | ApiErrorResponse,
            SubmitTaskRequest
        >,
        res: Response<{ submission: Submission } | ApiErrorResponse>,
    ) => {
        const taskId = parseTaskId(req.params.id)
        if (taskId === null) {
            res.status(400).json({ error: 'Invalid task id' })
            return
        }
        const { content }: SubmitTaskRequest = req.body
        if (!content) {
            res.status(400).json({ error: 'content is required' })
            return
        }

        const task = await fetchTaskById(taskId)
        if (!task) {
            res.status(404).json({ error: 'Task not found' })
            return
        }

        // Check existing submission
        const existingSubs = await db
            .select()
            .from(submissions)
            .where(eq(submissions.taskId, taskId))

        let submission: Submission
        if (existingSubs.length > 0) {
            // Update existing submission content (re-submit)
            const updatedRows = await db
                .update(submissions)
                .set({ content })
                .where(eq(submissions.id, existingSubs[0].id))
                .returning()
            submission = updatedRows[0] as Submission
        } else {
            // New submission
            const insertedRows = await db
                .insert(submissions)
                .values({ taskId, content })
                .returning()
            submission = insertedRows[0] as Submission

            // Update task status to completed
            await db
                .update(tasks)
                .set({ status: 'completed' })
                .where(eq(tasks.id, taskId))
        }

        res.json({ submission })
    },
)

// AI-generate a title for a task based on its submission content
router.post(
    '/:id/ai-title',
    async (
        req: Request<{ id: string }, { title: string } | ApiErrorResponse>,
        res: Response<{ title: string } | ApiErrorResponse>,
    ) => {
        const taskId = parseTaskId(req.params.id)
        if (taskId === null) {
            res.status(400).json({ error: 'Invalid task id' })
            return
        }

        const task = await fetchTaskById(taskId)
        if (!task) {
            res.status(404).json({ error: 'Task not found' })
            return
        }

        const submission = await fetchSubmissionByTaskId(taskId)
        if (!submission || !submission.content) {
            res.status(400).json({
                error: 'No submission content to generate title from',
            })
            return
        }

        // task.type is already TaskType, pass directly
        const title = await generateTitle(submission.content, task.type, taskId)

        // Update task title
        await db.update(tasks).set({ title }).where(eq(tasks.id, taskId))

        res.json({ title })
    },
)

// AI-generate a task title given type and grade
router.post(
    '/ai-generate-title',
    async (
        req: Request<
            {},
            { title: string } | ApiErrorResponse,
            { type: string; grade: number }
        >,
        res: Response<{ title: string } | ApiErrorResponse>,
    ) => {
        const { type, grade } = req.body
        if (!type || !grade) {
            res.status(400).json({ error: 'type 和 grade 为必填项' })
            return
        }

        const title = await generateTaskTitle(toTaskType(type), grade)

        res.json({ title })
    },
)

// AI-score a task's submission using DeepSeek (allows re-scoring)
router.post(
    '/:id/ai-score',
    async (
        req: Request<{ id: string }, SubmitTaskResponse | ApiErrorResponse>,
        res: Response<SubmitTaskResponse | ApiErrorResponse>,
    ) => {
        const taskId = parseTaskId(req.params.id)
        if (taskId === null) {
            res.status(400).json({ error: 'Invalid task id' })
            return
        }

        const task = await fetchTaskById(taskId)
        if (!task) {
            res.status(404).json({ error: 'Task not found' })
            return
        }

        const submission = await fetchSubmissionByTaskId(taskId)
        if (!submission) {
            res.status(404).json({
                error: 'Submission not found, please submit first',
            })
            return
        }

        // AI scoring
        const aiResult = await scoreComposition(
            submission.content,
            task.type,
            task.title,
            taskId,
        )

        // Delete old point records (re-scoring overwrites)
        await deleteOldPoints(submission.id)

        // Update submission with AI results and scoredAt
        await db
            .update(submissions)
            .set({
                grade: aiResult.grade,
                aiScore: JSON.stringify(aiResult),
                scoredAt: new Date().toISOString(),
            })
            .where(eq(submissions.id, submission.id))

        // Record new points
        const points = await recordPoints(
            aiResult.grade,
            submission.id,
            'AI评分',
        )

        res.json({
            submission: {
                ...submission,
                grade: aiResult.grade,
                aiScore: JSON.stringify(aiResult),
                scoredAt: new Date().toISOString(),
            } as Submission,
            aiResult,
            pointsEarned: points,
        })
    },
)

export default router
