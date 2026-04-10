import { Router, type Request, type Response } from 'express';
import { db } from '../db/index';
import { ruleConfig } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { RuleConfig, ApiErrorResponse } from '../types';

const router = Router();

// Get all rules (returns raw DB rows)
router.get('/', async (res: Response) => {
  const configs: RuleConfig[] = await db.select().from(ruleConfig) as RuleConfig[];
  const result: Record<string, unknown> = {};
  for (const c of configs) {
    result[c.key] = JSON.parse(c.value);
  }
  res.json(result);
});

// Get rules by key
router.get('/:key', async (req: Request<{ key: string }>, res: Response) => {
  const { key } = req.params;
  const rows = await db.select().from(ruleConfig).where(eq(ruleConfig.key, key)) as RuleConfig[];
  const config: RuleConfig | undefined = rows[0];
  if (!config) {
    res.status(404).json({ error: 'Rule not found' });
    return;
  }
  res.json(JSON.parse(config.value));
});

// Update rules
router.put('/:key', async (req: Request<{ key: string }>, res: Response<{ success: boolean } | ApiErrorResponse>) => {
  const { key } = req.params;
  const value: string = JSON.stringify(req.body);

  const rows = await db.select().from(ruleConfig).where(eq(ruleConfig.key, key)) as RuleConfig[];
  const existing: RuleConfig | undefined = rows[0];
  if (existing) {
    await db.update(ruleConfig).set({ value }).where(eq(ruleConfig.key, key));
  } else {
    await db.insert(ruleConfig).values({ key, value });
  }

  res.json({ success: true });
});

export default router;
