import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import dotenv from 'dotenv'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

const serverRoot = path.resolve(import.meta.dirname, '..', '..')
// 全局唯一 env 文件位于仓库根目录（server/ 的上一级）。
const repoRoot = path.resolve(serverRoot, '..')
const envPath = path.resolve(repoRoot, '.env')
dotenv.config({ path: envPath })

// 测试环境下允许通过 TEST_DB_URL 覆盖为隔离的内存库（如 :memory:），
// 避免污染真实数据库，并保证每个测试进程数据独立。
const TEST_DB_URL = process.env.TEST_DB_URL
const DB_PATH = TEST_DB_URL
    ? TEST_DB_URL
    : process.env.DB_PATH
      ? path.resolve(serverRoot, process.env.DB_PATH)
      : path.resolve(serverRoot, 'data', 'study.db')

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
