/**
 * 本地题库路由：实时遍历指定目录下的题目文件（Markdown 与图片），提供清单、单篇内容读取、
 * AI 解题思路与 AI 出卷落盘。
 * 目录取自 options 表 system.libraryDirectory；留空时默认取与数据库文件所在目录（data）平级的
 * library/，相对配置按 APP_ROOT 解析、绝对配置原样使用，路径推导复用 db 导出的 DB_FILE_PATH。
 * 关键约束：仅允许 .md 与白名单图片；相对路径拒绝绝对路径与 .. 段，resolve 后必须落在题库根目录之内
 * （防目录遍历）；图片不经 Markdown 渲染，内容接口直接以 data URL 返回原始字节；
 * 解题思路只取题干段（剔除参考答案与已存思路区），生成后写回文档末尾的思路区；
 * 出卷标题由模型按年级、学科与题目要求自拟，文件名取其一级标题净化而来（去 Windows 非法字符与首尾点号），
 * 同名时追加序号，落盘前已由 AI 服务校验过可解析性；
 * 题目要求可附参考图片（data URL，最多 9 张、仅 PNG/JPEG/WebP），图片随 user 消息以
 * image_url 分片发送，模型档位由 DEEPSEEK_VISION_MODEL 决定（缺省即 DEEPSEEK_MODEL）；
 * 同一文件的写入必须排队串行，写入失败时降级为仅返回内容；
 * 删除接口复用同一套路径校验与文件队列，只删文件、不删目录，且不提供回收站。
 */
import { Router } from 'express'
import type { Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import {
    parseLibraryQuestions,
    splitLibraryAnswer,
    splitLibraryHints,
    upsertLibraryHint,
} from '@shared/utils'
import { client, DB_FILE_PATH } from '../db/index'
import { resolveDataDir, resolveFromRoot } from '../paths'
import { generateLibraryHint, generateLibraryPaper } from '../services/ai'
import { DEEPSEEK_API_KEY } from '../services/ai/core'
import { aiLimiter, libraryHintLimiter } from '../utils/rate-limit'
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

/** 解题思路缓存上限：进程内简易 LRU，超限时丢弃最早写入的一条 */
/** 进行中的同 key 请求：连点或并发时复用同一个 Promise，避免重复调用 AI 造成重复计费 */
const hintPending = new Map<string, Promise<string>>()
/** 按文件的写入队列：读-改-写必须串行，避免同一文件多题同时生成时互相覆盖 */
const fileWriteChains = new Map<string, Promise<void>>()

/** 把写文件任务挂到该文件的串行队列尾部，返回本次任务的 Promise（失败由调用方处理） */
function enqueueFileWrite(
    absPath: string,
    task: () => Promise<void>,
): Promise<void> {
    const previous = fileWriteChains.get(absPath) ?? Promise.resolve()
    const current = previous.then(task, task)
    // 队列只负责串行化；吞掉拒绝以免前一次失败阻断后续写入，真实错误由 current 抛给调用方
    fileWriteChains.set(
        absPath,
        current.then(
            () => undefined,
            () => undefined,
        ),
    )
    return current
}

interface LibraryHintResponse {
    hint: string
    /** 是否为文件中已保存的思路（未重新调用 AI） */
    cached: boolean
    /** 本次结果是否已写入题目文件；写入失败时仍返回内容，仅提示未持久化 */
    saved: boolean
}

/**
 * 生成单道小题的解题思路。
 * 只接收路径与小题索引，题干由服务端自行读取并剔除参考答案段——
 * 前端无法借此接口提交任意 prompt，答案也不会被送进模型。
 */
router.post('/hint', libraryHintLimiter, async (req: Request, res: Response) => {
    try {
        if (!DEEPSEEK_API_KEY) {
            res.status(503).json({
                error: 'AI 解题思路未配置，请先在服务端设置 DEEPSEEK_API_KEY',
            } satisfies ApiErrorResponse)
            return
        }

        const body = (req.body ?? {}) as {
            path?: unknown
            questionIndex?: unknown
            regenerate?: unknown
        }
        const relPath = typeof body.path === 'string' ? body.path : ''
        const questionIndex = Number(body.questionIndex)
        if (!Number.isInteger(questionIndex) || questionIndex < 0) {
            res.status(400).json({
                error: '题目序号不合法',
            } satisfies ApiErrorResponse)
            return
        }

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
        // 图片题无法交给文本模型讲解，与前端不渲染按钮的判断保持一致
        if (!MD_EXTENSION.test(absPath)) {
            res.status(400).json({
                error: '图片题目暂不支持解题思路',
            } satisfies ApiErrorResponse)
            return
        }
        const stat = fs.statSync(absPath)
        if (stat.size > MAX_FILE_SIZE) {
            res.status(413).json({
                error: '题目文件过大，无法生成解题思路',
            } satisfies ApiErrorResponse)
            return
        }

        const markdown = fs.readFileSync(absPath, 'utf8')
        // 先剥离文末已保存的思路区，题干与小题索引均由共享解析器产出，与前端渲染时的划分完全一致
        const { body: contentBody, hints } = splitLibraryHints(markdown)
        const { question } = splitLibraryAnswer(contentBody)
        const blocks = parseLibraryQuestions(question)
        const block = blocks[questionIndex]
        if (!block || block.kind !== 'question') {
            res.status(400).json({
                error: '未找到对应的题目，请刷新后重试',
            } satisfies ApiErrorResponse)
            return
        }

        const isRegenerate = body.regenerate === true
        // 已保存过的思路直接复用，二次查看不再调用 AI
        const stored = hints.get(questionIndex)
        if (!isRegenerate && stored) {
            res.json({
                hint: stored.markdown,
                cached: true,
                saved: true,
            } satisfies LibraryHintResponse)
            return
        }

        const cacheKey = `${relPath}|${stat.mtimeMs}|${questionIndex}`
        const title = resolveTitle(
            markdown,
            path.basename(absPath, path.extname(absPath)),
        )
        let pending = isRegenerate ? undefined : hintPending.get(cacheKey)
        if (!pending) {
            pending = generateLibraryHint(block.content, title, isRegenerate)
            if (!isRegenerate) {
                hintPending.set(cacheKey, pending)
                // 成功或失败都释放占位，失败由下方 await 统一处理
                void pending.then(
                    () => hintPending.delete(cacheKey),
                    () => hintPending.delete(cacheKey),
                )
            }
        }
        const hint = await pending

        // 写入题目文件：队列内重新读取最新内容后再改，避免覆盖用户此刻的其它编辑
        let isSaved = true
        try {
            await enqueueFileWrite(absPath, async () => {
                const latest = await fs.promises.readFile(absPath, 'utf8')
                const updated = upsertLibraryHint(latest, {
                    index: questionIndex,
                    number: block.number,
                    section: block.section,
                    content: hint,
                })
                if (updated !== latest) {
                    await fs.promises.writeFile(absPath, updated, 'utf8')
                }
            })
        } catch (writeError: unknown) {
            // 只读目录或权限不足时不影响本次查看，仅提示未持久化
            isSaved = false
            const message =
                writeError instanceof Error ? writeError.message : String(writeError)
            console.warn('解题思路写入题目文件失败:', message)
        }

        res.json({ hint, cached: false, saved: isSaved } satisfies LibraryHintResponse)
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        console.error('生成解题思路失败:', message)
        res.status(500).json({
            error: '生成解题思路失败，请稍后重试',
        } satisfies ApiErrorResponse)
    }
})

interface LibraryGenerateResponse {
    /** 新文件相对题库根目录的路径，前端据此定位并刷新清单 */
    path: string
    title: string
    /** 生成结果全文，便于前端在写入成功后直接预览 */
    content: string
}

/** 读取短文本入参：去空白、截断到上限，非字符串按空处理 */
function readShortText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, maxLength)
}

/**
 * 参考图片入参：只接受 data URL（避免服务端被要求抓取任意远程地址形成 SSRF），
 * 前端已把图片长边压到 1600px 内，单张字符数上限对应约 1.1MB 二进制；
 * 9 张合计约 13.5M 字符，仍在 express.json 的 20mb 之内。
 */
const MAX_REFERENCE_IMAGES = 9
const MAX_REFERENCE_IMAGE_CHARS = 1_500_000
const REFERENCE_IMAGE_PATTERN =
    /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/

/** 解析出卷参考图片：合法返回数组，非法返回 null（由调用方转 400） */
function readReferenceImages(value: unknown): string[] | null {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) return null
    if (value.length > MAX_REFERENCE_IMAGES) return null
    const images: string[] = []
    for (const item of value) {
        if (typeof item !== 'string') return null
        if (item.length > MAX_REFERENCE_IMAGE_CHARS) return null
        if (!REFERENCE_IMAGE_PATTERN.test(item)) return null
        images.push(item)
    }
    return images
}

/** 读取整数入参：非法或越界时回落到默认值，而不是直接报错 */
function readIntInRange(
    value: unknown,
    min: number,
    max: number,
    fallback: number,
): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.round(parsed)))
}

/**
 * 由试卷标题推导文件名：去掉 Windows 非法字符与控制字符，压缩空白并截到 60 字，
 * 再去掉结尾的点与空格（Windows 不允许），空标题回落时间戳避免落成 .md。
 */
function buildPaperFileName(title: string): string {
    const cleaned = title
        .replace(/[\\/:*?"<>|]/g, ' ')
        // 控制字符按范围过滤：Windows 文件名不允许，且可能被用于绕过日志与终端显示
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')
        .slice(0, 60)
        .replace(/[. ]+$/, '')
    return cleaned || `AI 试卷 ${Date.now()}`
}

/** 同名文件已存在时依次尝试 `-2`、`-3`…，最多 50 次，避免覆盖用户已有题目 */
function resolveUniquePaperPath(rootDir: string, title: string): string {
    const base = buildPaperFileName(title)
    for (let index = 1; index <= 50; index += 1) {
        const fileName = index === 1 ? `${base}.md` : `${base}-${index}.md`
        const absolute = path.join(rootDir, fileName)
        if (!fs.existsSync(absolute)) return absolute
    }
    throw new Error('同名试卷文件过多，请换一个标题')
}

/**
 * AI 出卷并落盘。
 * 只接收标题与出卷参数，题干完全由模型生成，前端无法提交任意 prompt；
 * 生成结果由 AI 服务校验过标题行、考试信息行、答案段与可解析性，写盘失败时直接报错，
 * 不返回半成品——避免题库里出现前端无法逐题渲染的文件。
 */
router.post('/generate', aiLimiter, async (req: Request, res: Response) => {
    try {
        if (!DEEPSEEK_API_KEY) {
            res.status(503).json({
                error: 'AI 出卷未配置，请先在服务端设置 DEEPSEEK_API_KEY',
            } satisfies ApiErrorResponse)
            return
        }

        const body = (req.body ?? {}) as Record<string, unknown>
        const images = readReferenceImages(body.images)
        if (images === null) {
            res.status(400).json({
                error: '参考图片不合法：最多 9 张，仅支持 PNG/JPEG/WebP，单张不宜超过约 1.1MB',
            } satisfies ApiErrorResponse)
            return
        }
        const markdown = await generateLibraryPaper({
            grade: readShortText(body.grade, 20) || '六年级',
            subject: readShortText(body.subject, 20) || '数学',
            requirements: readShortText(body.requirements, 500),
            questionCount: readIntInRange(body.questionCount, 1, 40, 10),
            images,
        })

        const { rootDir } = await resolveLibraryRoot()
        await fs.promises.mkdir(rootDir, { recursive: true })
        // 标题由模型按课程与考点自拟，直接取生成内容的一级标题；取不到时用时间戳兜底
        const title = resolveTitle(markdown, `AI 题目 ${Date.now()}`)
        const absPath = resolveUniquePaperPath(rootDir, title)
        await enqueueFileWrite(absPath, async () => {
            await fs.promises.writeFile(absPath, markdown, 'utf8')
        })

        const relPath = path
            .relative(rootDir, absPath)
            .split(path.sep)
            .join('/')
        res.json({
            path: relPath,
            title,
            content: markdown,
        } satisfies LibraryGenerateResponse)
    } catch (error: unknown) {
        // 只记录服务端日志：模型输出的格式问题对用户统一表述为「请重试」
        const message = error instanceof Error ? error.message : String(error)
        console.error('AI 生成试卷失败:', message)
        res.status(502).json({
            error: 'AI 生成试卷失败，请稍后重试',
        } satisfies ApiErrorResponse)
    }
})

/**
 * 删除题库文件。
 * 只接受题库根目录内的 .md 与白名单图片（复用 resolveSafePath 的全部越界校验），
 * 不支持目录删除、不提供回收站，删除即不可恢复；写盘队列与思路写回共用，
 * 避免删除与读-改-写并发留下残影文件。软链在扫描阶段已被跳过，此处也要求命中真实普通文件。
 */
router.delete('/file', async (req: Request, res: Response) => {
    try {
        const relPath =
            typeof req.query.path === 'string' ? req.query.path.trim() : ''
        if (!relPath) {
            res.status(400).json({
                error: '缺少要删除的文件路径',
            } satisfies ApiErrorResponse)
            return
        }
        const { rootDir } = await resolveLibraryRoot()
        const absPath = resolveSafePath(rootDir, relPath)
        if (!absPath) {
            // 与内容读取保持一致：越界、非白名单扩展名统一按禁止访问处理
            res.status(403).json({
                error: '文件路径不合法',
            } satisfies ApiErrorResponse)
            return
        }
        const stat = await fs.promises.stat(absPath).catch(() => null)
        if (!stat?.isFile()) {
            res.status(404).json({
                error: '文件不存在',
            } satisfies ApiErrorResponse)
            return
        }
        await enqueueFileWrite(absPath, async () => {
            await fs.promises.unlink(absPath)
        })
        res.json({ deleted: true, path: relPath })
    } catch (error: unknown) {
        console.error('删除题库文件失败:', error)
        res.status(500).json({
            error: '删除文件失败，请稍后重试',
        } satisfies ApiErrorResponse)
    }
})

export { router as libraryRouter }
