import { Router, type Request, type Response } from 'express';
import { db } from '../db/index';
import { tasks, submissions, pointRecords } from '../db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { scoreComposition, generateTitle } from '../services/ai';
import { getPointsForGrade } from '../services/points';
import { loadRules } from './rules-loader';
import { recomputeMonthSummary } from './summary-helper';
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
} from '../types';

const router = Router();

// Helper: delete old point records for a submission (for re-scoring)
async function deleteOldPoints(submissionId: number) {
  await db.delete(pointRecords).where(
    and(eq(pointRecords.relatedId, submissionId), eq(pointRecords.relatedType, 'submission'))
  );
}

// Helper: record points for a submission
async function recordPoints(gradeValue: string, submissionId: number, suffix: string) {
  const rules = await loadRules();
  const points = getPointsForGrade(rules, gradeValue);
  if (points !== 0) {
    await db.insert(pointRecords).values({
      type: points > 0 ? 'earn' : 'deduct',
      amount: Math.abs(points),
      reason: `作业${suffix} ${gradeValue}`,
      ruleName: 'gradingScale.homework',
      relatedId: submissionId,
      relatedType: 'submission',
    });
    // Sync month summary
    await recomputeMonthSummary(new Date().toISOString().slice(0, 7));
  }
  return points;
}

// Get all tasks (with submission info)
router.get('/', async (req: Request, res: Response) => {
  const { status, type } = req.query as { status?: TaskStatus; type?: TaskType };

  let taskRows: Task[];
  if (status) {
    taskRows = await db.select().from(tasks).where(eq(tasks.status, status)).orderBy(desc(tasks.createdAt)) as Task[];
  } else if (type) {
    taskRows = await db.select().from(tasks).where(eq(tasks.type, type)).orderBy(desc(tasks.createdAt)) as Task[];
  } else {
    taskRows = await db.select().from(tasks).orderBy(desc(tasks.createdAt)) as Task[];
  }

  // Batch-fetch submissions and point records to avoid N+1 queries
  const taskIds = taskRows.map((t) => t.id);

  const allSubs = taskIds.length > 0
    ? await db.select().from(submissions).where(
        taskIds.length === 1
          ? eq(submissions.taskId, taskIds[0])
          : inArray(submissions.taskId, taskIds)
      )
    : [];
  const subMap = new Map<number, Submission>();
  for (const s of allSubs) {
    subMap.set((s as Submission).taskId, s as Submission);
  }

  const subIds = allSubs.map((s) => (s as Submission).id);
  const allPoints = subIds.length > 0
    ? await db.select().from(pointRecords).where(
        and(
          eq(pointRecords.relatedType, 'submission'),
          subIds.length === 1
            ? eq(pointRecords.relatedId, subIds[0])
            : inArray(pointRecords.relatedId, subIds)
        )
      )
    : [];
  const pointMap = new Map<number, { type: string; amount: number }>();
  for (const p of allPoints) {
    // Keep the latest point record per submission (last one wins)
    pointMap.set(p.relatedId!, { type: p.type, amount: p.amount });
  }

  const result = taskRows.map((task) => {
    const sub = subMap.get(task.id) ?? undefined;

    let pointsEarned: number | null = null;
    if (sub) {
      const latest = pointMap.get(sub.id);
      if (latest) {
        pointsEarned = latest.type === 'earn' ? latest.amount : -latest.amount;
      }
    }

    return {
      ...task,
      submission: sub ? {
        id: sub.id,
        content: sub.content,
        grade: sub.grade,
        aiScore: sub.aiScore,
        scoredAt: sub.scoredAt,
        createdAt: sub.createdAt,
      } : null,
      aiComment: sub?.aiScore ? (JSON.parse(sub.aiScore).comment ?? null) : null,
      submittedAt: sub?.createdAt ?? null,
      gradedAt: sub?.scoredAt ?? null,
      pointsEarned,
      aiSuggestions: sub?.aiScore ? (JSON.parse(sub.aiScore).suggestions ?? []) : [],
    };
  });

  res.json(result);
});

// Create a task
router.post('/', async (req: Request<{}, Task | ApiErrorResponse, CreateTaskRequest>, res: Response<Task | ApiErrorResponse>) => {
  const { title, type }: CreateTaskRequest = req.body;
  if (!title || !type) {
    res.status(400).json({ error: 'title and type are required' });
    return;
  }
  const result = await db.insert(tasks).values({ title, type }).returning();
  res.json(result[0] as Task);
});

// Update a task
router.put('/:id', async (req: Request<{ id: string }, Task | ApiErrorResponse, UpdateTaskRequest>, res: Response<Task | ApiErrorResponse>) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: 'Invalid task id' });
    return;
  }
  const { title, type, status }: UpdateTaskRequest = req.body;
  const result = await db
    .update(tasks)
    .set({ ...(title && { title }), ...(type && { type }), ...(status && { status }) })
    .where(eq(tasks.id, taskId))
    .returning();
  if (!result[0]) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json(result[0] as Task);
});

// Delete a task
router.delete('/:id', async (req: Request<{ id: string }>, res: Response<ApiSuccessResponse | ApiErrorResponse>) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: 'Invalid task id' });
    return;
  }
  await db.delete(tasks).where(eq(tasks.id, taskId));
  res.json({ success: true });
});

// Submit work for a task (save/overwrite content)
router.post('/:id/submit', async (req: Request<{ id: string }, { submission: Submission } | ApiErrorResponse, SubmitTaskRequest>, res: Response<{ submission: Submission } | ApiErrorResponse>) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: 'Invalid task id' });
    return;
  }
  const { content }: SubmitTaskRequest = req.body;
  if (!content) {
    res.status(400).json({ error: 'content is required' });
    return;
  }

  const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const task = taskRows[0] as Task | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Check existing submission
  const existingSubs = await db.select().from(submissions).where(eq(submissions.taskId, taskId));

  let submission: Submission;
  if (existingSubs.length > 0) {
    // Update existing submission content (re-submit)
    const updatedRows = await db
      .update(submissions)
      .set({ content })
      .where(eq(submissions.id, existingSubs[0].id))
      .returning();
    submission = updatedRows[0] as Submission;
  } else {
    // New submission
    const insertedRows = await db
      .insert(submissions)
      .values({ taskId, content })
      .returning();
    submission = insertedRows[0] as Submission;

    // Update task status to completed
    await db.update(tasks).set({ status: 'completed' }).where(eq(tasks.id, taskId));
  }

  res.json({ submission });
});

// AI-generate a title for a task based on its submission content
router.post('/:id/ai-title', async (req: Request<{ id: string }, { title: string } | ApiErrorResponse>, res: Response<{ title: string } | ApiErrorResponse>) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: 'Invalid task id' });
    return;
  }

  const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const task = taskRows[0] as Task | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const subRows = await db.select().from(submissions).where(eq(submissions.taskId, taskId));
  const submission = subRows[0] as Submission | undefined;
  if (!submission || !submission.content) {
    res.status(400).json({ error: 'No submission content to generate title from' });
    return;
  }

  const title = await generateTitle(submission.content, task.type === 'mindmap' ? 'mindmap' : 'composition', task.title, taskId);

  // Update task title
  await db.update(tasks).set({ title }).where(eq(tasks.id, taskId));

  res.json({ title });
});

// AI-score a task's submission using DeepSeek (allows re-scoring)
router.post('/:id/ai-score', async (req: Request<{ id: string }, SubmitTaskResponse | ApiErrorResponse>, res: Response<SubmitTaskResponse | ApiErrorResponse>) => {
  const taskId = Number(req.params.id);
  if (!Number.isInteger(taskId) || taskId <= 0) {
    res.status(400).json({ error: 'Invalid task id' });
    return;
  }

  const taskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const task = taskRows[0] as Task | undefined;
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const subRows = await db.select().from(submissions).where(eq(submissions.taskId, taskId));
  const submission = subRows[0] as Submission | undefined;
  if (!submission) {
    res.status(404).json({ error: 'Submission not found, please submit first' });
    return;
  }

  // AI scoring
  const aiResult = await scoreComposition(submission.content, task.title, task.type === 'mindmap' ? 'mindmap' : 'composition', taskId);

  // Delete old point records (re-scoring overwrites)
  await deleteOldPoints(submission.id);

  // Update submission with AI results and scoredAt
  await db.update(submissions).set({
    grade: aiResult.grade,
    aiScore: JSON.stringify(aiResult),
    scoredAt: new Date().toISOString(),
  }).where(eq(submissions.id, submission.id));

  // Record new points
  const points = await recordPoints(aiResult.grade, submission.id, 'AI评分');

  res.json({ submission: { ...submission, grade: aiResult.grade, aiScore: JSON.stringify(aiResult), scoredAt: new Date().toISOString() } as Submission, aiResult, pointsEarned: points });
});

export default router;
