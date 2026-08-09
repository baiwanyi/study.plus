import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { pushSQLiteSchema } from 'drizzle-kit/api'
import { client, db } from '../src/db/index'
import * as schema from '../src/db/schema'
import { options } from '../src/db/schema'

/**
 * 在测试内存库中同步 schema。基于 schema.ts（单一事实来源）通过 drizzle-kit 的
 * pushSQLiteSchema 生成并执行建表语句。该 API 返回 { apply }，需显式调用 apply()
 * 才会落到数据库；drizzle-kit 在非 CLI 上下文会调用 process.exit，这里临时拦截。
 */
export async function pushSchema(): Promise<void> {
    const originalExit = process.exit
    process.exit = (() => undefined) as never
    try {
        const drizzleInstance = drizzle(client)
        const pushResult = await pushSQLiteSchema(schema, drizzleInstance)
        await pushResult.apply()
    } finally {
        process.exit = originalExit
    }
    await db.run(sql`PRAGMA foreign_keys = ON`)
}

/** 写入 options 表键值（积分规则、系统设置等均存于此），冲突时覆盖。 */
export async function seedOptions(
    entries: Record<string, unknown>,
): Promise<void> {
    for (const [key, value] of Object.entries(entries)) {
        const serialized = JSON.stringify(value)
        await db
            .insert(options)
            .values({ key, value: serialized })
            .onConflictDoUpdate({
                target: options.key,
                set: { value: serialized },
            })
    }
}

/**
 * 注入作业等级积分规则，供 loadRules 读取（读取单独的 'homework' 键）。
 * 例：seedHomeworkRule({ A: 20 }) → 评分等级 A 记 20 分。
 */
export async function seedHomeworkRule(
    pointsByGrade: Record<string, number>,
): Promise<void> {
    const list = Object.entries(pointsByGrade).map(([grade, points]) => ({
        grade,
        points,
    }))
    await seedOptions({
        homework: list,
        system: { monthlyBasePoints: 0 },
    })
}

export { db }
