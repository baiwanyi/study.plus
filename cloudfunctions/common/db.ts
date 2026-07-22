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
