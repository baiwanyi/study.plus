/**
 * 数据库连接与 Drizzle 客户端初始化，为全部路由与服务提供唯一的 db 实例。
 * 配置统一从应用根目录（APP_ROOT）下的 .env 加载，表结构定义复用同目录 schema。
 * 测试环境可通过 TEST_DB_URL 切换为隔离的内存库，避免污染真实数据；
 * .env 位于 APP_ROOT，数据库目录以 RUNTIME_ROOT 为基准（本地调试为 .deploy/data，
 * 部署态为部署目录/data），目录在启动时按需创建；未配置 DB_PATH 时用 RUNTIME_ROOT/data/study.db，
 * 显式配置则相对 RUNTIME_ROOT 解析，打包态仍兼容回退上一级 data。
 */
import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/libsql'
import { resolveDataDir, resolveEnvPath, resolveFromRuntimeRoot } from '../paths'
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
      ? resolveFromRuntimeRoot(process.env.DB_PATH)
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

// 仅文件型数据库具备可复制的物理路径；测试内存库与远程库返回 null。
// 备份模块据此判定能否生成快照，无需重复实现上面的路径回退规则。
export const DB_FILE_PATH: string | null = TEST_DB_URL ? null : DB_PATH

export const db = drizzle(client, { schema })
export { client }
