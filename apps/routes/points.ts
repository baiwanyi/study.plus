import { Router, type Request, type Response } from 'express';
import { db } from '../db/index';
import { pointRecords } from '../db/schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';
import { getPointsForGrade, getPointsForExamScore } from '../services/points';
import { loadRules } from './rules-loader';
import { recomputeMonthSummary } from './summary-helper';
import type {
  PointRecord,
  CreatePointRecordRequest,
  PointStats,
  PointRecordType,
  RelatedType,
  ApiErrorResponse,
} from '../types';

const router = Router();

// Get point records with filters
router.get('/', async (req: Request, res: Response<PointRecord[]>) => {
  const { type, month, relatedType } = req.query as { type?: PointRecordType; month?: string; relatedType?: RelatedType };
  const conditions = [];

  if (type) conditions.push(eq(pointRecords.type, type));
  if (relatedType) conditions.push(eq(pointRecords.relatedType, relatedType));
  if (month) {
    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    // Calculate correct end of month
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    endDate.setUTCDate(0); // Last day of the month
    endDate.setUTCHours(23, 59, 59, 999);
    const start = startDate.toISOString();
    const end = endDate.toISOString();
    conditions.push(gte(pointRecords.createdAt, start));
    conditions.push(lte(pointRecords.createdAt, end));
  }

  const records: PointRecord[] = conditions.length > 0
    ? await db.select().from(pointRecords).where(and(...conditions)).orderBy(desc(pointRecords.createdAt)) as PointRecord[]
    : await db.select().from(pointRecords).orderBy(desc(pointRecords.createdAt)) as PointRecord[];

  res.json(records);
});

// Create a point record (manual earn/deduct)
router.post('/', async (req: Request<{}, PointRecord | ApiErrorResponse, CreatePointRecordRequest>, res: Response<PointRecord | ApiErrorResponse>) => {
  const { type, amount, reason, ruleName, relatedId, relatedType }: CreatePointRecordRequest = req.body;
  if (!type || amount === undefined || amount === null || !reason) {
    res.status(400).json({ error: 'type, amount and reason are required' });
    return;
  }
  const result = await db
    .insert(pointRecords)
    .values({ type, amount, reason, ruleName, relatedId, relatedType })
    .returning();
  await recomputeMonthSummary(new Date().toISOString().slice(0, 7));
  res.json(result[0] as PointRecord);
});

// Create a point record by grade (auto-calculates amount from rules)
router.post('/by-grade', async (req: Request<{}, PointRecord | ApiErrorResponse, { category: string; grade: string; remark?: string }>, res: Response<PointRecord | ApiErrorResponse>) => {
  const { category, grade, remark } = req.body;
  if (!category || !grade) {
    res.status(400).json({ error: 'category and grade are required' });
    return;
  }

  const categoryLabel = category === 'submission' ? '作业批改' : category === 'exam' ? '单元测评' : category;

  // Load rules
  const rules = await loadRules();

  const points = getPointsForGrade(rules, grade);
  const recordType = points >= 0 ? 'earn' : 'deduct';
  const reason = `${categoryLabel} - ${grade}${remark ? ` (${remark})` : ''}`;

  const result = await db
    .insert(pointRecords)
    .values({
      type: recordType,
      amount: Math.abs(points),
      reason,
      ruleName: `${categoryLabel}-${grade}`,
      relatedType: category as RelatedType,
    })
    .returning();
  await recomputeMonthSummary(new Date().toISOString().slice(0, 7));
  res.json(result[0] as PointRecord);
});

// Create a point record by exam score (auto-calculates amount from exam score rules)
router.post('/by-exam-score', async (req: Request<{}, PointRecord | ApiErrorResponse, { score: number; remark?: string }>, res: Response<PointRecord | ApiErrorResponse>) => {
  const { score, remark } = req.body;
  if (score === undefined || score === null) {
    res.status(400).json({ error: 'score is required' });
    return;
  }

  const numScore = Number(score);
  if (isNaN(numScore)) {
    res.status(400).json({ error: 'score must be a number' });
    return;
  }

  // Load rules
  const rules = await loadRules();

  const matched = getPointsForExamScore(rules, numScore);
  if (!matched) {
    res.status(400).json({ error: `未找到分数 ${numScore} 对应的积分规则` });
    return;
  }

  const points = matched.points;
  const recordType = points >= 0 ? 'earn' : 'deduct';
  const reason = `单元测评 - ${numScore}分${remark ? ` (${remark})` : ''}`;
  const ruleName = `${matched.min}-${matched.max}分`;

  const result = await db
    .insert(pointRecords)
    .values({
      type: recordType,
      amount: Math.abs(points),
      reason,
      ruleName,
      relatedType: 'exam' as RelatedType,
    })
    .returning();
  await recomputeMonthSummary(new Date().toISOString().slice(0, 7));
  res.json(result[0] as PointRecord);
});

// Create a point record by custom rule
router.post('/by-custom-rule', async (req: Request<{}, PointRecord | ApiErrorResponse, { ruleId: string }>, res: Response<PointRecord | ApiErrorResponse>) => {
  const { ruleId } = req.body;
  if (!ruleId) {
    res.status(400).json({ error: 'ruleId is required' });
    return;
  }

  const rules = await loadRules();
  const customRule = rules.customRules.find(r => r.id === ruleId || r.name === ruleId);
  if (!customRule) {
    res.status(404).json({ error: '自定义规则不存在' });
    return;
  }

  const recordType: PointRecordType = customRule.type === 'earn' ? 'earn' : 'deduct';
  const reason = customRule.description ? `${customRule.name} - ${customRule.description}` : customRule.name;

  const result = await db
    .insert(pointRecords)
    .values({
      type: recordType,
      amount: customRule.points,
      reason,
      ruleName: customRule.name,
      relatedType: 'custom' as RelatedType,
    })
    .returning();
  await recomputeMonthSummary(new Date().toISOString().slice(0, 7));
  res.json(result[0] as PointRecord);
});

// Get monthly summary (dynamically computed from pointRecords)
router.get('/summary', async (req: Request, res: Response) => {
  const { month } = req.query as { month?: string };
  const targetMonth: string = month || new Date().toISOString().slice(0, 7);
  const summary = await recomputeMonthSummary(targetMonth);
  res.json(summary);
});

// Calculate monthly stats
router.get('/stats', async (req: Request, res: Response<PointStats>) => {
  const { month } = req.query as { month?: string };
  const targetMonth: string = month || new Date().toISOString().slice(0, 7);
  const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  endDate.setUTCHours(23, 59, 59, 999);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const earnResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
    .from(pointRecords)
    .where(and(eq(pointRecords.type, 'earn'), gte(pointRecords.createdAt, start), lte(pointRecords.createdAt, end)));

  const deductResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
    .from(pointRecords)
    .where(and(eq(pointRecords.type, 'deduct'), gte(pointRecords.createdAt, start), lte(pointRecords.createdAt, end)));

  const totalEarn: number = earnResult[0]?.total || 0;
  const totalDeduct: number = deductResult[0]?.total || 0;

  res.json({
    month: targetMonth,
    totalEarn,
    totalDeduct,
    net: totalEarn - totalDeduct,
  });
});

export default router;
