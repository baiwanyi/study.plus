/**
 * 题库根目录解析：题库路由与每日备份共用同一套「配置值 → 绝对路径」推导，
 * 避免两处各写一份时把备份打包到与页面展示不同的目录。
 * 复用约定：配置取自 options 表 system.libraryDirectory，绝对路径原样使用、相对路径按 APP_ROOT 解析，
 * 留空回落到与数据库文件所在目录（data）平级的 library/，路径推导复用 db 的 DB_FILE_PATH 与 paths 工具。
 * 关键约束：读取配置失败必须回落默认目录而非抛错（题库路由与备份都依赖该降级）；
 * 本模块只解析路径，不判断目录是否存在、也不创建目录。
 */
import path from 'path'
import { client, DB_FILE_PATH } from '../db/index'
import { resolveDataDir, resolveFromRoot } from '../paths'

/** 未配置自定义目录时，清单与备份中展示的目录名 */
const DEFAULT_DIR_LABEL = 'library'

/**
 * 题库默认目录：与 data 目录同级，即同为「数据库文件所在目录的父目录」下的兄弟目录。
 * 数据目录随 DB_PATH 迁移，题库目录据此自动跟随；测试内存库没有物理路径，
 * 此时回落 resolveDataDir() 以保持同一语义。
 */
function resolveDefaultLibraryDir(): string {
    const dataFile = DB_FILE_PATH ?? path.join(resolveDataDir(), 'study.db')
    return path.join(path.dirname(path.dirname(dataFile)), 'library')
}

/** 解析题库根目录：配置值优先（绝对路径原样、相对路径按 APP_ROOT 解析），留空用默认目录 */
export async function resolveLibraryRoot(): Promise<{
    dirLabel: string
    rootDir: string
}> {
    let configured = ''
    try {
        const rows = await client.execute({
            sql: "SELECT value FROM options WHERE key = 'system'",
            args: [],
        })
        const value = rows.rows[0]?.value
        const parsed = value
            ? (JSON.parse(value as string) as Record<string, unknown>)
            : {}
        if (typeof parsed.libraryDirectory === 'string') {
            configured = parsed.libraryDirectory.trim()
        }
    } catch (err) {
        console.error('读取题库目录配置失败，回落默认目录:', err)
    }
    const rootDir = configured
        ? path.isAbsolute(configured)
            ? path.resolve(configured)
            : resolveFromRoot(configured)
        : resolveDefaultLibraryDir()
    return { dirLabel: configured || DEFAULT_DIR_LABEL, rootDir }
}
