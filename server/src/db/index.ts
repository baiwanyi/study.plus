/**
 * 数据库连接与 Drizzle 客户端初始化，为全部路由与服务提供唯一的 db 实例。
 * 配置统一从应用根目录（APP_ROOT）下的 .env 加载，表结构定义复用同目录 schema。
 * 测试环境可通过 TEST_DB_URL 切换为隔离的内存库，避免污染真实数据；
 * 数据库与 .env 同在 APP_ROOT 下（开发态为仓库根，部署态为部署目录），
 * 数据库目录在启动时按需创建；未配置 DB_PATH 时按「APP_ROOT/data → 上一级 data」查找，
 * 使仓库内试跑产物能复用仓库根的数据库；显式配置 DB_PATH 则严格相对 APP_ROOT 解析。
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/libsql'
import { resolveDataDir, resolveEnvPath, resolveFromRoot } from '../paths'
import * as schema from './schema'

// env 文件按「应用根目录 → 其上一级」的顺序查找：
// 开发态与独立部署使用自身目录的 .env，仓库根试跑产物时复用仓库根的 .env。
dotenv.config({ path: resolveEnvPath() })

// 测试环境下允许通过 TEST_DB_URL 覆盖为隔离的内存库（如 :memory:），
// 避免污染真实数据库，并保证每个测试进程数据独立。
const TEST_DB_URL = process.env.TEST_DB_URL
const DB_PATH = TEST_DB_URL
    ? TEST_DB_URL
    : process.env.DB_PATH
      ? resolveFromRoot(process.env.DB_PATH)
      : path.join(resolveDataDir(), 'study.db')

// 仅当使用真实文件数据库时才确保目录存在；内存库 / 远程 URL 无需建目录。
if (!TEST_DB_URL) {
    const dir = path.dirname(DB_PATH)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

const client = createClient({
    url: TEST_DB_URL ?? `file:${DB_PATH}`,
})

export const db = drizzle(client, { schema })
export { client }
