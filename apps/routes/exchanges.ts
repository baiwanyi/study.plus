import { Router, type Request, type Response } from 'express';
import { db } from '@apps/db/index';
import { exchanges, pointRecords } from '@apps/db/schema';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { loadRulesWithSrc, getExchangeItemLabel } from '@apps/routes/rules-loader';
import { recomputeMonthSummary } from '@apps/routes/summary-helper';
import type {
  Exchange,
  CreateExchangeRequest,
  ExchangeStatus,
  RevokeExchangeResponse,
  ApiErrorResponse,
} from '@apps/types';

const router = Router();

// Get all exchange records
router.get('/', async (req: Request, res: Response<Exchange[]>) => {
  const { itemType, month, status } = req.query as { itemType?: string; month?: string; status?: ExchangeStatus };
  const conditions = [];

  if (itemType) conditions.push(eq(exchanges.itemType, itemType));
  if (status) conditions.push(eq(exchanges.status, status));
  if (month) {
    const startDate = new Date(`${month}-01T00:00:00.000Z`);
    const endDate = new Date(startDate);
    endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    endDate.setUTCDate(0);
    endDate.setUTCHours(23, 59, 59, 999);
    conditions.push(gte(exchanges.createdAt, startDate.toISOString()));
    conditions.push(lte(exchanges.createdAt, endDate.toISOString()));
  }

  const records: Exchange[] = conditions.length > 0
    ? await db.select().from(exchanges).where(and(...conditions)).orderBy(desc(exchanges.createdAt)) as Exchange[]
    : await db.select().from(exchanges).orderBy(desc(exchanges.createdAt)) as Exchange[];

  res.json(records);
});

// Create an exchange
router.post('/', async (req: Request<{}, Exchange | ApiErrorResponse, CreateExchangeRequest>, res: Response<Exchange | ApiErrorResponse>) => {
  const { itemType, pointsCost }: CreateExchangeRequest = req.body;
  if (!itemType || !pointsCost) {
    res.status(400).json({ error: 'itemType and pointsCost are required' });
    return;
  }

  // Get rules and exchange source data in a single query
  const { rules, exchangeSrc } = await loadRulesWithSrc();

  // Get item label from rules
  const itemLabel = getExchangeItemLabel(exchangeSrc, itemType);

  // Calculate detail
  let detail = '';
  const rate = rules.exchangeRates[itemType];
  if (rate) {
    const quantity: number = (pointsCost / (rate.points || 1)) * rate.ratio;
    const formattedQty = Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
    detail = `${formattedQty}${rate.unit}`;
  }

  // Check if current month balance allows (dynamically computed from pointRecords)
  const currentMonth: string = new Date().toISOString().slice(0, 7);
  const summary = await recomputeMonthSummary(currentMonth);

  if (summary.availableBalance < pointsCost) {
    res.status(400).json({ error: '积分不足', balance: summary.availableBalance });
    return;
  }

  // Create exchange record
  const exchangeRows = await db
    .insert(exchanges)
    .values({ itemType, pointsCost, detail })
    .returning();
  const exchange: Exchange = exchangeRows[0] as Exchange;

  // Record deduction
  await db.insert(pointRecords).values({
    type: 'deduct',
    amount: pointsCost,
    reason: `兑换${itemLabel} ${detail}`,
    ruleName: `exchangeRates.${itemType}`,
    relatedId: exchange.id,
    relatedType: 'custom',
  });

  // Recompute month summary after deduction
  await recomputeMonthSummary(currentMonth);

  res.json(exchange);
});

// Revoke an exchange
router.post('/:id/revoke', async (req: Request<{ id: string }>, res: Response<RevokeExchangeResponse | ApiErrorResponse>) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid exchange id' });
    return;
  }

  const exchangeRows = await db.select().from(exchanges).where(eq(exchanges.id, id)) as Exchange[];
  const exchange: Exchange | undefined = exchangeRows[0];
  if (!exchange) {
    res.status(404).json({ error: 'Exchange not found' });
    return;
  }
  if (exchange.status === 'revoked') {
    res.status(400).json({ error: 'Already revoked' });
    return;
  }

  // Get item label from rules (single DB query)
  const { exchangeSrc } = await loadRulesWithSrc();
  const itemLabel = getExchangeItemLabel(exchangeSrc, exchange.itemType);

  // Update exchange status and record refund
  try {
    await db.insert(pointRecords).values({
      type: 'earn',
      amount: exchange.pointsCost,
      reason: `撤销兑换${itemLabel} ${exchange.detail}`,
      ruleName: 'exchangeRevoked',
      relatedId: exchange.id,
      relatedType: 'custom',
    });

    // Only mark as revoked after refund succeeds (avoids partial state)
    await db.update(exchanges)
      .set({ status: 'revoked' })
      .where(eq(exchanges.id, id));
  } catch (err) {
    console.error('Exchange revoke failed:', err);
    res.status(500).json({ error: '撤销失败，请重试' });
    return;
  }

  // Recompute month summary after refund
  await recomputeMonthSummary(new Date().toISOString().slice(0, 7));

  res.json({ success: true });
});

export default router;
