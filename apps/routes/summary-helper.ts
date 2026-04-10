import { db } from '../db/index';
import { pointRecords, monthSummary } from '../db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { loadRules } from './rules-loader';
import type { MonthSummary } from '../types';

interface ComputedSummary extends MonthSummary {
  totalEarn: number;
  totalDeduct: number;
  balance: number;
  /** Available points for exchange = basePoints - totalDeduct (this month's earnings are not usable until next month) */
  availableBalance: number;
  /** Minimum points required to use privileges (from rule_config) */
  minimumPointsForPrivileges: number;
}

/**
 * Ensure month_summary row exists for the given month.
 * Also carries over last month's balance as this month's basePoints if not already set.
 */
async function ensureMonthRow(targetMonth: string): Promise<MonthSummary> {
  const rows = await db.select().from(monthSummary).where(eq(monthSummary.month, targetMonth)) as MonthSummary[];
  if (rows.length > 0) return rows[0];

  // Get monthly base points from rules
  const rules = await loadRules();
  const defaultBasePoints = rules.monthlyBasePoints;

  // Calculate carry-over from previous month
  const prevMonthDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = prevMonthDate.toISOString().slice(0, 7);

  let basePoints = defaultBasePoints;
  const prevRows = await db.select().from(monthSummary).where(eq(monthSummary.month, prevMonth)) as MonthSummary[];
  if (prevRows.length > 0) {
    // Carry over previous month's balance as this month's basePoints
    const prev = prevRows[0];
    const prevStartDate = new Date(`${prevMonth}-01T00:00:00.000Z`);
    const prevEndDate = new Date(prevStartDate);
    prevEndDate.setUTCMonth(prevEndDate.getUTCMonth() + 1);
    prevEndDate.setUTCDate(0);
    prevEndDate.setUTCHours(23, 59, 59, 999);
    const prevStart = prevStartDate.toISOString();
    const prevEnd = prevEndDate.toISOString();
    const prevEarn = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(pointRecords)
      .where(and(eq(pointRecords.type, 'earn'), gte(pointRecords.createdAt, prevStart), lte(pointRecords.createdAt, prevEnd)));
    const prevDeduct = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(pointRecords)
      .where(and(eq(pointRecords.type, 'deduct'), gte(pointRecords.createdAt, prevStart), lte(pointRecords.createdAt, prevEnd)));
    basePoints = prev.basePoints + Number(prevEarn[0]?.total || 0) - Number(prevDeduct[0]?.total || 0);
  }

  const inserted = await db.insert(monthSummary).values({ month: targetMonth, basePoints }).returning();
  return inserted[0] as MonthSummary;
}

/**
 * Recompute month summary from pointRecords and update the DB row.
 * Returns the computed summary.
 */
export async function recomputeMonthSummary(targetMonth: string): Promise<ComputedSummary> {
  const startDate = new Date(`${targetMonth}-01T00:00:00.000Z`);
  const endDate = new Date(startDate);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  endDate.setUTCDate(0);
  endDate.setUTCHours(23, 59, 59, 999);
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const summary = await ensureMonthRow(targetMonth);

  // Load rules for minimumPointsForPrivileges
  const rules = await loadRules();
  const minimumPointsForPrivileges = rules.minimumPointsForPrivileges;

  const earnResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
    .from(pointRecords)
    .where(and(eq(pointRecords.type, 'earn'), gte(pointRecords.createdAt, start), lte(pointRecords.createdAt, end)));
  const deductResult = await db
    .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
    .from(pointRecords)
    .where(and(eq(pointRecords.type, 'deduct'), gte(pointRecords.createdAt, start), lte(pointRecords.createdAt, end)));

  const totalEarn = Number(earnResult[0]?.total) || 0;
  const totalDeduct = Number(deductResult[0]?.total) || 0;
  const balance = summary.basePoints + totalEarn - totalDeduct;
  // This month's earnings are not available for exchange until next month
  const availableBalance = summary.basePoints - totalDeduct;

  // Update stored values
  await db.update(monthSummary)
    .set({ totalEarn, totalDeduct, balance })
    .where(eq(monthSummary.month, targetMonth));

  return { ...summary, totalEarn, totalDeduct, balance, availableBalance, minimumPointsForPrivileges };
}
