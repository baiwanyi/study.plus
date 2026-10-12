/**
 * 本地题库路由：实时遍历指定目录下的题目文件（Markdown 与图片），提供清单与单篇内容读取。
 * 目录取自 options 表 system.libraryDirectory；留空时默认取与数据库文件所在目录（data）平级的
 * library/，即独立于 data 的兄弟目录并随 DB_PATH 迁移（DB_PATH 指向部署目录之外时自动跟随），
 * 相对配置按 APP_ROOT 解析、绝对配置原样使用，路径推导复用 db 导出的 DB_FILE_PATH。
 * 关键约束：仅允许 .md 与白名单图片；相对路径拒绝绝对路径与 .. 段，resolve 后必须落在题库根目录之内
 * （防目录遍历）；跳过符号链接，限制扫描深度/数量与单文件体积；图片不经 Markdown 渲染，
 * 内容接口直接以 data URL 返回原始字节，MIME 只取扩展名白名单而不采信文件内容；全部为只读 GET 接口。
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { client, DB_FILE_PATH } from '../db/index'
import { resolveDataDir, resolveFromRoot } from '../paths'
import type { ApiErrorResponse } from '@shared/types'

const router = Router()

const MAX_SCAN_DEPTH = 20
const MAX_SCAN_FILES = 500
const MAX_FILE_SIZE = 1024 * 1024
/** 图片体积上限：需经 base64 内联进 JSON（约 1.37 倍），故高于纯文本上限 */
const MAX_IMAGE_SIZE = 4 * 1024 * 1024
/** 仅读取文件头部用于解析 front-matter 与标题，避免整篇载入大文件 */
const HEAD_BYTES = 8192
const MAX_REL_PATH_LENGTH = 512
const DEFAULT_DIR_LABEL = 'library'
const MD_EXTENSION = /\.md$/i
/**
 * 图片扩展名 → MIME 白名单：数据库中的 MIME 完全由此表决定，不读取文件内容做嗅探，
 * 避免伪造扩展名的文件被当作其他类型下发；不支持 SVG（可内嵌脚本，无需扩大攻击面）。
 */
const IMAGE_MIME_TYPES: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
}

/** 文件类型：Markdown 走渲染管线，图片直出原图 */
type LibraryFileKind = 'markdown' | 'image'

type LibraryFileType =
    | { kind: 'markdown' }
    | { kind: 'image'; mime: string }

interface LibraryFrontMatter {
    title?: string
    fullScore?: number
}

interface LibraryFileMeta {
    path: string
    name: string
    kind: LibraryFileKind
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

/** 按文件名归类：.md 归 Markdown，白名单图片归图片并带上 MIME，其余一律不收录 */
function resolveFileType(fileName: string): LibraryFileType | null {
    if (MD_EXTENSION.test(fileName)) return { kind: 'markdown' }
    const mime = IMAGE_MIME_TYPES[path.extname(fileName).toLowerCase()]
    return mime ? { kind: 'image', mime } : null
}

interface ScannedFile {
    absPath: string
    type: LibraryFileType
}

function scanLibraryFiles(dir: string, depth = 0): ScannedFile[] {
    if (depth >= MAX_SCAN_DEPTH) return []
    let entries: fs.Dirent[]
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
        return []
    }
    const results: ScannedFile[] = []
    for (const entry of entries) {
        if (results.length >= MAX_SCAN_FILES) break
        const fullPath = path.join(dir, entry.name)
        // 不跟随符号链接：软链文件/目录一律跳过，防止越权读取或软链成环
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
            results.push(...scanLibraryFiles(fullPath, depth + 1))
        } else if (entry.isFile() && results.length < MAX_SCAN_FILES) {
            const type = resolveFileType(entry.name)
            if (type) results.push({ absPath: fullPath, type })
        }
    }
    return results
}

/**
 * 题库默认目录：与 data 目录同级，即同为「数据库文件所在目录的父目录」下的兄弟目录。
 * 数据目录随 DB_PATH 迁移，题库目录据此自动跟随；测试内存库没有物理路径，
 * 此时回落 resolveDataDir() 以保持同一语义。
 */
function resolveDefaultLibraryDir(): string {
    const dataFile = DB_FILE_PATH ?? path.join(resolveDataDir(), 'study.db')
    return path.join(path.dirname(path.dirname(dataFile)), 'library')
}

/** 解析题库根目录：配置值优先（绝对路径原样、相对路径按 APP_ROOT 解析），留空用 resolveDefaultLibraryDir() */
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
        : resolveDefaultLibraryDir()
    return { dirLabel: configured || DEFAULT_DIR_LABEL, rootDir }
}

/**
 * 把前端传来的相对路径解析为绝对路径；任何越界、非 md/图片或异常输入一律返回 null。
 * 校验顺序：长度/空字符 → 绝对路径 → `..` 段 → 扩展名白名单 → resolve 后前缀比对。
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
    if (!resolveFileType(normalized)) return null
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
        const scanned = scanLibraryFiles(rootDir)
        const files: LibraryFileMeta[] = []
        for (const { absPath, type } of scanned) {
            try {
                const stat = fs.statSync(absPath)
                const name = path.basename(absPath, path.extname(absPath))
                const relPath = path
                    .relative(rootDir, absPath)
                    .split(path.sep)
                    .join('/')
                // 图片没有 front-matter 与标题，直接用文件名，且不解析满分
                if (type.kind === 'image') {
                    files.push({
                        path: relPath,
                        name,
                        kind: 'image',
                        title: name,
                        fullScore: null,
                        size: stat.size,
                        mtime: stat.mtime.toISOString(),
                    })
                    continue
                }
                const head = readHead(absPath)
                const { data } = parseFrontMatter(head)
                files.push({
                    path: relPath,
                    name,
                    kind: 'markdown',
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
        const type = resolveFileType(path.basename(absPath))
        if (!type) {
            res.status(403).json({ error: '题目路径不合法' } satisfies ApiErrorResponse)
            return
        }
        const sizeLimit = type.kind === 'image' ? MAX_IMAGE_SIZE : MAX_FILE_SIZE
        if (stat.size > sizeLimit) {
            res.status(413).json({
                error: '题目文件过大，无法读取',
            } satisfies ApiErrorResponse)
            return
        }
        const normalizedPath = relPath.split(/[\\/]+/).filter(Boolean).join('/')
        const name = path.basename(absPath, path.extname(absPath))
        const mtime = stat.mtime.toISOString()
        // 图片不做 Markdown 渲染：内联为 data URL 交给前端 <img>，响应体不含服务端绝对路径
        if (type.kind === 'image') {
            const image: LibraryFileDetail = {
                path: normalizedPath,
                kind: 'image',
                title: name,
                fullScore: null,
                mtime,
                content: `data:${type.mime};base64,${fs.readFileSync(absPath).toString('base64')}`,
            }
            res.json(image)
            return
        }
        const markdown = fs.readFileSync(absPath, 'utf8')
        const detail: LibraryFileDetail = {
            path: normalizedPath,
            kind: 'markdown',
            title: resolveTitle(markdown, name),
            fullScore: parseFrontMatter(markdown).data.fullScore ?? null,
            mtime,
            content: markdown,
        }
        res.json(detail)
    } catch (err) {
        console.error('读取题目内容失败:', err)
        res.status(500).json({ error: '读取题目内容失败' } satisfies ApiErrorResponse)
    }
})

export { router as libraryRouter }
