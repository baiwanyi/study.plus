import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '@apps/db/schema'
import path from 'path'
import fs from 'fs'
import os from 'os'

let _client: Client | null = null

/**
 * Create a fresh test database in a temp directory.
 * Each call creates a new isolated database.
 */
export function createTestDb() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'study-test-'))
    const dbPath = path.join(tmpDir, 'test.db')
    const client = createClient({
        url: `file:${dbPath}`,
    })
    const db = drizzle(client, { schema })
    _client = client
    return { client, db, dbPath, tmpDir }
}

/**
 * Run migrations (create all tables) on the test database.
 */
export async function createTables(client: Client) {
    await client.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('composition', 'mindmap', 'notes')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id),
            content TEXT NOT NULL,
            grade TEXT CHECK(grade IN ('A+', 'A', 'B', 'C', 'D', 'E')),
            ai_score TEXT,
            scored_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS point_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('earn', 'deduct')),
            amount INTEGER NOT NULL,
            reason TEXT NOT NULL,
            rule_name TEXT,
            related_id INTEGER,
            related_type TEXT CHECK(related_type IN ('task', 'submission', 'exam', 'extra', 'custom', 'exchange', 'revoked', 'advance')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS exchanges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT NOT NULL,
            points_cost INTEGER NOT NULL,
            detail TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT NOT NULL UNIQUE,
            value TEXT NOT NULL
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS point_advances (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            amount INTEGER NOT NULL,
            total_repayment INTEGER NOT NULL,
            installments INTEGER NOT NULL,
            installment_amount INTEGER NOT NULL,
            paid_installments INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS month_summary (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            month TEXT NOT NULL UNIQUE,
            base_points INTEGER NOT NULL DEFAULT 500,
            total_earn INTEGER NOT NULL DEFAULT 0,
            total_deduct INTEGER NOT NULL DEFAULT 0,
            total_exchanges INTEGER NOT NULL DEFAULT 0,
            balance INTEGER NOT NULL DEFAULT 500
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS ai_usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project TEXT NOT NULL,
            task_id INTEGER,
            task_title TEXT,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)
    await client.execute(`
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            title TEXT NOT NULL,
            md5 TEXT NOT NULL UNIQUE,
            views INTEGER NOT NULL DEFAULT 0,
            resume_time INTEGER NOT NULL DEFAULT 0,
            favorite INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    `)

    // Insert default options for rules
    const defaultRules = [
        { key: 'homework', value: JSON.stringify([{ grade: 'A+', points: 50 }, { grade: 'A', points: 20 }, { grade: 'B', points: 10 }, { grade: 'C', points: -10 }, { grade: 'D', points: -20 }, { grade: 'E', points: -50 }]) },
        { key: 'exam', value: JSON.stringify([{ min: 0, max: 59, points: -50 }, { min: 60, max: 69, points: -20 }, { min: 70, max: 79, points: -10 }, { min: 80, max: 89, points: 10 }, { min: 90, max: 94, points: 20 }, { min: 95, max: 100, points: 50 }]) },
        { key: 'exchange', value: JSON.stringify([{ key: 'game', label: '娱乐时间', points: 1, ratio: 10, unit: '分钟' }, { key: 'cash', label: '现金兑换', points: 10, ratio: 1, unit: '元' }]) },
        { key: 'custom', value: JSON.stringify([]) },
        { key: 'system', value: JSON.stringify({ pageSize: 20, autosaveInterval: 10, monthlyBasePoints: 500, minimumPointsForPrivileges: 100, advanceRepayRatio: 16, maxPendingAmount: 500 }) },
    ]
    for (const rule of defaultRules) {
        await client.execute({
            sql: 'INSERT OR IGNORE INTO options (key, value) VALUES (?, ?)',
            args: [rule.key, rule.value],
        })
    }
}

/**
 * Clean all data from tables (for use between tests).
 */
export async function cleanTables(client: Client) {
    const tables = [
        'tasks', 'submissions', 'point_records', 'exchanges',
        'options', 'point_advances', 'month_summary', 'ai_usage_logs', 'videos',
    ]
    for (const table of tables) {
        await client.execute(`DELETE FROM ${table}`)
    }
    // Re-insert default options
    const defaultRules = [
        { key: 'homework', value: JSON.stringify([{ grade: 'A+', points: 50 }, { grade: 'A', points: 20 }, { grade: 'B', points: 10 }, { grade: 'C', points: -10 }, { grade: 'D', points: -20 }, { grade: 'E', points: -50 }]) },
        { key: 'exam', value: JSON.stringify([{ min: 0, max: 59, points: -50 }, { min: 60, max: 69, points: -20 }, { min: 70, max: 79, points: -10 }, { min: 80, max: 89, points: 10 }, { min: 90, max: 94, points: 20 }, { min: 95, max: 100, points: 50 }]) },
        { key: 'exchange', value: JSON.stringify([{ key: 'game', label: '娱乐时间', points: 1, ratio: 10, unit: '分钟' }, { key: 'cash', label: '现金兑换', points: 10, ratio: 1, unit: '元' }]) },
        { key: 'custom', value: JSON.stringify([]) },
        { key: 'system', value: JSON.stringify({ pageSize: 20, autosaveInterval: 10, monthlyBasePoints: 500, minimumPointsForPrivileges: 100, advanceRepayRatio: 16, maxPendingAmount: 500 }) },
    ]
    for (const rule of defaultRules) {
        const existing = await client.execute({
            sql: 'SELECT id FROM options WHERE key = ?',
            args: [rule.key],
        })
        if (existing.rows.length === 0) {
            await client.execute({
                sql: 'INSERT INTO options (key, value) VALUES (?, ?)',
                args: [rule.key, rule.value],
            })
        }
    }
}
