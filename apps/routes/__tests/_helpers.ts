/**
 * Shared test helper for creating mock databases.
 * Used by all route test files via vi.mock factory.
 */
import type { Client } from '@libsql/client'

// Global reference to the current test client (for cleanup)
let _currentClient: Client | null = null

export function getClient(): Client | null {
    return _currentClient
}

/**
 * Create a mock database module for use in vi.mock('@apps/db/index', ...).
 * Creates tables and inserts default options.
 */
export async function createMockDb(tmpDirPrefix: string): Promise<{
    db: unknown
    client: Client
}> {
    const { createClient } = await import('@libsql/client')
    const { drizzle } = await import('drizzle-orm/libsql')
    const schema = await import('@apps/db/schema')
    const path = await import('path')
    const fs = await import('fs')
    const os = await import('os')

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), tmpDirPrefix))
    const dbPath = path.join(tmpDir, 'test.db')
    const client = createClient({ url: `file:${dbPath}` })
    _currentClient = client

    // Create all tables
    await client.execute(`CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER NOT NULL REFERENCES tasks(id), content TEXT NOT NULL, grade TEXT, ai_score TEXT, scored_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS point_records (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, amount INTEGER NOT NULL, reason TEXT NOT NULL, rule_name TEXT, related_id INTEGER, related_type TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS exchanges (id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT NOT NULL, points_cost INTEGER NOT NULL, detail TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS options (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL)`)
    await client.execute(`CREATE TABLE IF NOT EXISTS point_advances (id INTEGER PRIMARY KEY AUTOINCREMENT, amount INTEGER NOT NULL, total_repayment INTEGER NOT NULL, installments INTEGER NOT NULL, installment_amount INTEGER NOT NULL, paid_installments INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT (datetime('now')))`)
    await client.execute(`CREATE TABLE IF NOT EXISTS month_summary (id INTEGER PRIMARY KEY AUTOINCREMENT, month TEXT NOT NULL UNIQUE, base_points INTEGER NOT NULL DEFAULT 500, total_earn INTEGER NOT NULL DEFAULT 0, total_deduct INTEGER NOT NULL DEFAULT 0, total_exchanges INTEGER NOT NULL DEFAULT 0, balance INTEGER NOT NULL DEFAULT 500)`)

    // Insert default options
    const defaultRules = [
        { key: 'homework', value: JSON.stringify([{ grade: 'A+', points: 50 }, { grade: 'A', points: 20 }, { grade: 'B', points: 10 }, { grade: 'C', points: -10 }, { grade: 'D', points: -20 }, { grade: 'E', points: -50 }]) },
        { key: 'exam', value: JSON.stringify([{ min: 0, max: 59, points: -50 }, { min: 60, max: 69, points: -20 }, { min: 70, max: 79, points: -10 }, { min: 80, max: 89, points: 10 }, { min: 90, max: 94, points: 20 }, { min: 95, max: 100, points: 50 }]) },
        { key: 'exchange', value: JSON.stringify([{ key: 'game', label: '娱乐时间', points: 1, ratio: 10, unit: '分钟' }, { key: 'cash', label: '现金兑换', points: 10, ratio: 1, unit: '元' }]) },
        { key: 'custom', value: JSON.stringify([]) },
        { key: 'system', value: JSON.stringify({ monthlyBasePoints: 500, minimumPointsForPrivileges: 100, advanceRepayRatio: 16, maxPendingAmount: 500 }) },
    ]
    for (const rule of defaultRules) {
        await client.execute({ sql: 'INSERT OR IGNORE INTO options (key, value) VALUES (?, ?)', args: [rule.key, rule.value] })
    }

    const db = drizzle(client, { schema })
    return { db, client }
}
