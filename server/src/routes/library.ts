/**
 * 本地题库路由：实时遍历指定目录下的 Markdown 题目文件，提供清单与单篇内容读取。
 * 目录取自 options 表 system.libraryDirectory；留空时回落 resolveDataDir()/library（与库文件同根），
 * 相对路径按 APP_ROOT 解析、绝对路径原样使用，读取逻辑复用 paths 模块而非另建基准。
 * 关键约束：仅允许 .md；相对路径拒绝绝对路径与 .. 段，resolve 后必须落在题库根目录之内（防目录遍历）；
 * 跳过符号链接，限制扫描深度/数量与单文件体积；全部为只读 GET 接口，不产生任何写入副作用。
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { client } from '../db/index'
import { resolveDataDir, resolveFromRoot } from '../paths'
import type { ApiErrorResponse } from '@shared/types'

const router = Router()

const MAX_SCAN_DEPTH = 20
const MAX_SCAN_FILES = 500
const MAX_FILE_SIZE = 1024 * 1024
/** 仅读取文件头部用于解析 front-matter 与标题，避免整篇载入大文件 */
const HEAD_BYTES = 8192
const MAX_REL_PATH_LENGTH = 512
const DEFAULT_DIR_LABEL = 'data/library'
const MD_EXTENSION = /\.md$/i

interface LibraryFrontMatter {
    title?: string
    fullScore?: number
}

interface LibraryFileMeta {
    path: string
    name: string
    title: string
    fullScore: number | null
    size: number
    mtime: string
}

interface LibraryFileDetail extends Omit<LibraryFileMeta, 'name' | 'size'> {
    content: string
}

/** 读取并解析 front-matter（仅支持 title / full_score 等简单标量键值，避免引入额外依赖） */
function parseFrontMatter(text: string): {
    data: LibraryFrontMatter
    body: string
} {
    const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
    if (!matched) {
        return { data: {}, body: text }
    }
    const data: LibraryFrontMatter = {}
    for (const line of matched[1].split(/\r?\n/)) {
        const index = line.indexOf(':')
        if (index <= 0) continue
        const key = line.slice(0, index).trim().toLowerCase()
        const raw = line
            .slice(index + 1)
            .trim()
            .replace(/^["']|["']$/g, '')
        if (key === 'title' && raw) {
            data.title = raw
        } else if (
            (key === 'fullscore' || key === 'full_score') &&
            raw &&
            Number.isFinite(Number(raw))
        ) {
            data.fullScore = Number(raw)
        }
    }
    return { data, body: text.slice(matched[0].length) }
}

/** 标题取值优先级：front-matter title → 首个一级标题 → 文件名 */
function resolveTitle(text: string, fallback: string): string {
    const { data, body } = parseFrontMatter(text)
    if (data.title) return data.title
    const heading = /^[ \t]*#[ \t]+(.+)$/m.exec(body)
    return heading ? heading[1].trim() : fallback
}

/** 以自然序（01-、02- 正确排序）排列相对路径 */
function compareNatural(a: string, b: string): number {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

function scanMarkdownFiles(dir: string, depth = 0): string[] {
    if (depth >= MAX_SCAN_DEPTH) return []
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return []
    }
    const results: string[] = []
    for (const entry of entries) {
        if (results.length >= MAX_SCAN_FILES) break
        const fullPath = path.join(dir, entry.name)
        // 不跟随符号链接：软链文件/目录一律跳过，防止越权读取或软链成环
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
            results.push(...scanMarkdownFiles(fullPath, depth + 1))
        } else if (
            entry.isFile() &&
            MD_EXTENSION.test(entry.name) &&
            results.length < MAX_SCAN_FILES
        ) {
            results.push(fullPath)
        }
    }
    return results
}

/** 解析题库根目录：配置值优先，绝对路径原样、相对路径按 APP_ROOT 解析，留空回落 data/library */
async function resolveLibraryRoot(): Promise<{
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
        : path.join(resolveDataDir(), 'library')
    return { dirLabel: configured || DEFAULT_DIR_LABEL, rootDir }
}

/**
 * 把前端传来的相对路径解析为绝对路径；任何越界、非 md 或异常输入一律返回 null。
 * 校验顺序：长度/空字符 → 绝对路径 → `..` 段 → 扩展名 → resolve 后前缀比对。
 */
function resolveSafePath(rootDir: string, relPath: string): string | null {
    if (!relPath || relPath.length > MAX_REL_PATH_LENGTH) return null
    if (relPath.includes('\0')) return null
    if (path.isAbsolute(relPath) || /^[a-zA-Z]:/.test(relPath)) return null
    const segments = relPath
        .split(/[\\/]+/)
        .filter((segment) => segment && segment !== '.')
    if (segments.length === 0) return null
    if (segments.includes('..')) return null
    const normalized = segments.join('/')
    if (!MD_EXTENSION.test(normalized)) return null
    const root = path.resolve(rootDir)
    const absolute = path.resolve(root, normalized)
    if (!absolute.startsWith(root + path.sep)) return null
    return absolute
}

/** 读取文件头部若干字节，用于提取标题与满分 */
function readHead(absPath: string): string {
    const buffer = Buffer.alloc(HEAD_BYTES)
    const fd = fs.openSync(absPath, 'r')
    try {
        const bytes = fs.readSync(fd, buffer, 0, HEAD_BYTES, 0)
        return buffer.subarray(0, bytes).toString('utf8')
    } finally {
        fs.closeSync(fd)
    }
}

router.get('/', async (_req: Request, res: Response) => {
    try {
        const { dirLabel, rootDir } = await resolveLibraryRoot()
        if (!fs.existsSync(rootDir)) {
            res.json({ dir: dirLabel, exists: false, files: [] })
            return
        }
        const absoluteFiles = scanMarkdownFiles(rootDir)
        const files: LibraryFileMeta[] = []
        for (const absPath of absoluteFiles) {
            try {
                const stat = fs.statSync(absPath)
                const head = readHead(absPath)
                const name = path.basename(absPath, path.extname(absPath))
                const relPath = path
                    .relative(rootDir, absPath)
                    .split(path.sep)
                    .join('/')
                const { data } = parseFrontMatter(head)
                files.push({
                    path: relPath,
                    name,
                    title: resolveTitle(head, name),
                    fullScore: data.fullScore ?? null,
                    size: stat.size,
                    mtime: stat.mtime.toISOString(),
                })
            } catch (err) {
                console.error('读取题目文件信息失败:', absPath, err)
            }
        }
        files.sort((a, b) => compareNatural(a.path, b.path))
        res.json({ dir: dirLabel, exists: true, files })
    } catch (err) {
        console.error('获取题库列表失败:', err)
        res.status(500).json({ error: '获取题库列表失败' } satisfies ApiErrorResponse)
    }
})

router.get('/content', async (req: Request, res: Response) => {
    try {
        const relPath = typeof req.query.path === 'string' ? req.query.path : ''
        const { rootDir } = await resolveLibraryRoot()
        const absPath = resolveSafePath(rootDir, relPath)
        if (!absPath) {
            res.status(403).json({ error: '题目路径不合法' } satisfies ApiErrorResponse)
            return
        }
        if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
            res.status(404).json({ error: '题目文件不存在' } satisfies ApiErrorResponse)
            return
        }
        const stat = fs.statSync(absPath)
        if (stat.size > MAX_FILE_SIZE) {
            res.status(413).json({
                error: '题目文件过大，无法读取',
            } satisfies ApiErrorResponse)
            return
        }
        const content = fs.readFileSync(absPath, 'utf8')
        const name = path.basename(absPath, path.extname(absPath))
        const detail: LibraryFileDetail = {
            path: relPath.split(/[\\/]+/).filter(Boolean).join('/'),
            title: resolveTitle(content, name),
            fullScore: parseFrontMatter(content).data.fullScore ?? null,
            mtime: stat.mtime.toISOString(),
            content,
        }
        res.json(detail)
    } catch (err) {
        console.error('读取题目内容失败:', err)
        res.status(500).json({ error: '读取题目内容失败' } satisfies ApiErrorResponse)
    }
})

export { router as libraryRouter }
