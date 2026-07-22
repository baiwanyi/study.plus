import mysql, { type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
import { getMysqlConfig } from './config'

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
    if (!pool) {
        const cfg = getMysqlConfig()
        pool = mysql.createPool({
            ...cfg,
            waitForConnections: true,
            connectionLimit: 10,
            charset: 'utf8mb4',
        })
    }
    return pool
}

/**
 * 参数化查询，返回多行。
 * 所有查询必须走此方法，禁止字符串拼接 SQL（防 SQL 注入）。
 */
export async function query<T extends RowDataPacket = RowDataPacket>(
    sql: string,
    params: unknown[] = [],
): Promise<T[]> {
    const [rows] = await getPool().query<T[]>(sql, params)
    return rows
}

/** 查询单行，无结果返回 null */
export async function queryOne<T extends RowDataPacket = RowDataPacket>(
    sql: string,
    params: unknown[] = [],
): Promise<T | null> {
    const rows = await query<T>(sql, params)
    return rows[0] ?? null
}

/** 执行写操作（INSERT/UPDATE/DELETE），返回受影响的行信息 */
export async function execute(
    sql: string,
    params: unknown[] = [],
): Promise<ResultSetHeader> {
    const [result] = await getPool().execute<ResultSetHeader>(sql, params)
    return result
}

/** 插入并返回自增主键 */
export async function insertAndGetId(
    sql: string,
    params: unknown[] = [],
): Promise<number> {
    const result = await execute(sql, params)
    return result.insertId
}

/** 带连接的查询（在事务内使用） */
export interface TxHelpers {
    query<T extends RowDataPacket = RowDataPacket>(sql: string, params?: unknown[]): Promise<T[]>
    execute(sql: string, params?: unknown[]): Promise<ResultSetHeader>
    insertAndGetId(sql: string, params?: unknown[]): Promise<number>
}

/**
 * 【安全设计说明】事务包装器：确保多步写操作的原子性。
 * - 自动从连接池获取连接
 * - fn 内的所有查询/执行使用同一连接（隔离的 TxHelpers）
 * - 成功自动 COMMIT，异常自动 ROLLBACK
 * - finally 释放连接回连接池
 */
export async function withTransaction<T>(
    fn: (tx: TxHelpers) => Promise<T>,
): Promise<T> {
    const conn = await getPool().getConnection()
    try {
        await conn.beginTransaction()

        const txQuery = async <T2 extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T2[]> => {
            const [rows] = await conn.query<T2[]>(sql, params)
            return rows
        }

        const txExecute = async (sql: string, params: unknown[] = []): Promise<ResultSetHeader> => {
            const [result] = await conn.execute<ResultSetHeader>(sql, params)
            return result
        }

        const txInsertAndGetId = async (sql: string, params: unknown[] = []): Promise<number> => {
            const result = await txExecute(sql, params)
            return result.insertId
        }

        const result = await fn({
            query: txQuery,
            execute: txExecute,
            insertAndGetId: txInsertAndGetId,
        })

        await conn.commit()
        return result
    } catch (err) {
        await conn.rollback()
        throw err
    } finally {
        conn.release()
    }
}
