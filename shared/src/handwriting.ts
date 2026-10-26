/**
 * 每日练字共享约定：A4 字帖几何参数、方格与字体类型、语料 Markdown 解析与网格排版纯函数。
 * 复用约定：语料以 Markdown 静态资源提供（apps/public/handwriting），此处只做无副作用的解析与排版，
 * 不依赖 DOM 与 Node API，前端渲染与 server 侧 Vitest 共用同一份逻辑。
 * 关键约束：列数、行数与页边距必须自洽（可用宽 = 左右边距 + 列数 × 格边），任一参数变动都会让
 * 字帖溢出到第二页；节选正文汉字数须在 20–40 之间，越界条目在解析阶段丢弃并告警，不进入随机池。
 */

/** 每行格数 */
export const SHEET_COLUMNS = 11

/** 每页行数（含标题行与作者行） */
export const SHEET_ROWS = 14

/** A4 纵向宽高（毫米）：高度比纸张少 1mm，避免 96dpi 取整后多顶出一张空白页 */
export const SHEET_WIDTH_MM = 210
export const SHEET_HEIGHT_MM = 296

/** 页内留白：上下需大于打印机不可打印区（通常 4–5mm） */
export const SHEET_PADDING_X_MM = 12
export const SHEET_PADDING_Y_MM = 14.5

/** 单格边长：由可用宽度等分得出，保持正方形 */
export const CELL_SIZE_MM =
    (SHEET_WIDTH_MM - SHEET_PADDING_X_MM * 2) / SHEET_COLUMNS

/** 行间距：把纵向剩余空间均分到行与行之间，保证 14 行恰好铺满一页 */
export const CELL_ROW_GAP_MM =
    (SHEET_HEIGHT_MM -
        SHEET_PADDING_Y_MM * 2 -
        CELL_SIZE_MM * SHEET_ROWS) /
    (SHEET_ROWS - 1)

/** 单字占格比例默认值：字高约为格边的 70%，四周留白便于观察结构 */
export const GLYPH_SCALE = 0.70

/** 字号占格比例的可调范围 */
export const minGlyphScale = 0.5
export const maxGlyphScale = 1

/** 字帖默认字色（墨绿灰）与方格色（浅绿） */
export const defaultInkColor = '#44524a'
export const defaultGridColor = '#7dcb9c'

/** 校验 #rrggbb 颜色值；不符合一律回落到给定默认色，防止任意字符串进入 SVG 属性 */
export function sanitizeHexColor(raw: string, fallback: string): string {
    const value = raw.trim()
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback
}

/** 把字号比例限制在可调范围内，非法数值回落到默认值 */
export function clampGlyphScale(value: number): number {
    if (!Number.isFinite(value)) return GLYPH_SCALE
    return Math.min(maxGlyphScale, Math.max(minGlyphScale, value))
}

/** 方格边框线宽（毫米）：低于 0.1mm 打印易断线，高于 1.2mm 会压住笔画 */
export const defaultBorderWidthMm = 0.3
export const minBorderWidthMm = 0.1
export const maxBorderWidthMm = 1.2

/** 把边框线宽夹到可调范围，非法数值回落到默认值 */
export function clampBorderWidthMm(value: number): number {
    if (!Number.isFinite(value)) return defaultBorderWidthMm
    return Math.min(maxBorderWidthMm, Math.max(minBorderWidthMm, value))
}

/** 节选语料正文汉字数区间：低于下限练不出成段笔势，高于上限一页排不下署名行 */
export const MIN_PASSAGE_CHARS = 20
export const MAX_PASSAGE_CHARS = 40

/** 方格类型：田字格 / 米字格 / 九宫格 */
export type GridKind = 'tian' | 'mi' | 'jiugong'

/** 内容模式：自定义 / 古诗词 / 课文节选 / 课外读物节选 */
export type ContentMode = 'custom' | 'poem' | 'textbook' | 'reading'

/** 标点策略：占格（规范书法训练） / 随字（标点压在前字右下角，不单独占格） */
export type PunctuationMode = 'grid' | 'inline'

export const gridKindLabels: Record<GridKind, string> = {
    tian: '田字格',
    mi: '米字格',
    jiugong: '九宫格',
}

export const contentModeLabels: Record<ContentMode, string> = {
    custom: '自定义',
    poem: '古诗词',
    textbook: '课文节选',
    reading: '课外读物',
}

/** 语料条目：标题 + 副标题（朝代作者或出处）+ 正文各行 */
export interface HandwritingEntry {
    title: string
    subtitle: string
    lines: string[]
}

/** 字帖内容：由语料条目或自定义文本转换而来 */
export interface HandwritingSheetData {
    title: string
    subtitle: string
    lines: string[]
}

/** 单个格子：主字 + 紧随其后的标点（避头挤格或标点随字时非空） */
export interface HandwritingCell {
    char: string
    trailing: string
}

/** 排版结果：固定 14 行 × 11 格 */
export interface HandwritingSheet {
    rows: HandwritingCell[][]
    /** 内容超出单页容量被截断 */
    isOverflow: boolean
}

export interface HandwritingLayoutOptions {
    punctuation: PunctuationMode
    /** 正文首行缩进空格数（节选与自定义文本使用，诗词语料不缩进） */
    indent: number
    /** 正文对齐方式：古诗词逐句居中，节选与自定义保持左起（缺省左对齐） */
    bodyAlign?: BodyAlign
    /** 题名位置：顶部居中（古诗词、自定义）或正文之后右对齐署名（节选），缺省顶部 */
    titlePlacement?: TitlePlacement
}

/** 正文对齐方式 */
export type BodyAlign = 'left' | 'center'

/** 题名位置：节选把「书名 + 作者」压在正文之后，署名右对齐，顶部不再重复题名 */
export type TitlePlacement = 'top' | 'footer'

/** 字体候选：family 为 CSS 字体名，label 为界面显示名 */
export interface HandwritingFontCandidate {
    family: string
    label: string
}

/** 内置字体：随 apps/public/fonts 分发，清单由构建插件扫描目录生成，不依赖用户机器是否安装 */
export interface BuiltinFont extends HandwritingFontCandidate {
    /** 相对 public 根目录的文件路径，加载时需拼上 BASE_URL */
    file: string
}

/**
 * 由字体文件名（已去掉扩展名）推导 CSS 族名：保留汉字、字母、数字与连字符，
 * 空格、中点、括号等一律压成单个连字符，保证结果落在 sanitizeFontFamily 的白名单内；
 * 文件名只剩符号时返回空串，由调用方跳过该文件。
 * 族名与显示名分开推导，是为了让「方正字迹·董海涛硬笔楷书 简」这类带符号的文件名也能安全拼进 font-family。
 */
export function normalizeFontFamilyFromFile(name: string): string {
    const slug = name
        .trim()
        .replace(/[^\u4e00-\u9fa5\w-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64)
    return sanitizeFontFamily(slug)
}

/**
 * 本地字体候选表：浏览器无法读取全部本地字体时，用 canvas 逐项探测实际可用性。
 * 顺序即下拉顺序，按字帖用途分组：楷书 → 隶/行/手写 → 仿宋/宋体 → 黑体/圆体 → 开源字体；
 * 覆盖 Windows 预装（含 Office 附带华文、方正系列）与 macOS 预装中文字体，默认首选楷体。
 */
export const handwritingFontCandidates: HandwritingFontCandidate[] = [
    // 楷书
    { family: 'KaiTi', label: '楷体' },
    { family: 'KaiTi_GB2312', label: '楷体_GB2312' },
    { family: 'STKaiti', label: '华文楷体' },
    { family: 'Kaiti SC', label: '楷体-简' },
    // 隶书
    { family: 'LiSu', label: '隶书' },
    { family: 'STLiti', label: '华文隶书' },
    { family: 'Libian SC', label: '隶变-简' },
    { family: 'Baoli SC', label: '报隶-简' },
    // 行楷与手写体
    { family: 'STXingkai', label: '华文行楷' },
    { family: 'Xingkai SC', label: '行楷-简' },
    { family: 'STXinwei', label: '华文新魏' },
    { family: 'Weibei SC', label: '魏碑-简' },
    { family: 'FZShuTi', label: '方正舒体' },
    { family: 'FZYaoTi', label: '方正姚体' },
    { family: 'Hannotate SC', label: '手札体-简' },
    { family: 'HanziPen SC', label: '翩翩体-简' },
    { family: 'Wawati SC', label: '娃娃体-简' },
    { family: 'Yuppy SC', label: '雅痞-简' },
    // 仿宋与宋体
    { family: 'FangSong', label: '仿宋' },
    { family: 'FangSong_GB2312', label: '仿宋_GB2312' },
    { family: 'STFangsong', label: '华文仿宋' },
    { family: 'SimSun', label: '宋体' },
    { family: 'NSimSun', label: '新宋体' },
    { family: 'STSong', label: '华文宋体' },
    { family: 'Songti SC', label: '宋体-简' },
    { family: 'STZhongsong', label: '华文中宋' },
    { family: 'STCaiyun', label: '华文彩云' },
    // 黑体与圆体
    { family: 'SimHei', label: '黑体' },
    { family: 'STHeiti', label: '华文黑体' },
    { family: 'STXihei', label: '华文细黑' },
    { family: 'Microsoft YaHei', label: '微软雅黑' },
    { family: 'Microsoft YaHei UI', label: '微软雅黑 UI' },
    { family: 'DengXian', label: '等线' },
    { family: 'Heiti SC', label: '黑体-简' },
    { family: 'PingFang SC', label: '苹方' },
    { family: 'Hiragino Sans GB', label: '冬青黑体' },
    { family: 'Lantinghei SC', label: '兰亭黑-简' },
    { family: 'YouYuan', label: '幼圆' },
    { family: 'Yuanti SC', label: '圆体-简' },
    // 开源字体
    { family: 'Source Han Serif SC', label: '思源宋体' },
    { family: 'Source Han Sans SC', label: '思源黑体' },
    { family: 'Noto Serif SC', label: 'Noto Serif SC' },
    { family: 'Noto Sans SC', label: 'Noto Sans SC' },
]

/** 字体名白名单：仅允许字母、数字、空格、连字符、点与汉字，防止拼接进 style 造成注入 */
const FONT_FAMILY_PATTERN = /^[\u4e00-\u9fa5\w\s.-]{1,64}$/

/** 校验字体名是否可用于 CSS font-family，非法值一律回落到默认字体 */
export function sanitizeFontFamily(raw: string): string {
    const value = raw.trim()
    if (!value || !FONT_FAMILY_PATTERN.test(value)) return ''
    return value
}

/** 闭标点：不能出现在行首（避头） */
const CLOSING_PUNCTUATION = '，。、；：？！）》」』”’…—·,.;:?!)'

/** 开标点：不能出现在行尾（避尾） */
const OPENING_PUNCTUATION = '（《「『“‘([{'

function isClosingPunctuation(char: string): boolean {
    return CLOSING_PUNCTUATION.includes(char)
}

function isOpeningPunctuation(char: string): boolean {
    return OPENING_PUNCTUATION.includes(char)
}

/** 按码点切分，避免代理对字符被拆成半个 */
export function splitCharacters(text: string): string[] {
    return Array.from(text)
}

/** 统计汉字数（剔除标点、空白与西文字符） */
export function countHanzi(text: string): number {
    return splitCharacters(text).filter((char) => /[\u4e00-\u9fa5]/.test(char))
        .length
}

const createCell = (char: string): HandwritingCell => ({ char, trailing: '' })

const createBlankRow = (): HandwritingCell[] =>
    Array.from({ length: SHEET_COLUMNS }, () => createCell(''))

/**
 * 把一行文本转成格子序列。
 * 标点占格模式下每个字符各占一格；标点随字模式下标点并入前格 trailing。
 * 行首空格保留为空白格（供自定义内容手工缩进），行尾空白裁掉。
 */
export function toCells(
    line: string,
    punctuation: PunctuationMode,
): HandwritingCell[] {
    const trimmed = line.replace(/\s+$/u, '')
    const cells: HandwritingCell[] = []
    for (const char of splitCharacters(trimmed)) {
        // 半角与全角空格都渲染为空白格，便于中文输入法下手工缩进
        if (char === ' ' || char === '\u3000') {
            cells.push(createCell(''))
            continue
        }
        if (punctuation === 'inline' && isClosingPunctuation(char)) {
            const previous = cells[cells.length - 1]
            if (previous) {
                previous.trailing += char
                continue
            }
        }
        cells.push(createCell(char))
    }
    return cells
}

/**
 * 按列数折行，同时处理避头避尾：
 * 切点落在开标点之前（不让开标点留在行尾），切点后的闭标点挤入上一行末格（不落在行首）。
 */
export function wrapCells(
    cells: HandwritingCell[],
    columns: number,
): HandwritingCell[][] {
    const rows: HandwritingCell[][] = []
    let index = 0
    while (index < cells.length) {
        const rowLimit = Math.min(index + columns, cells.length)
        let end = rowLimit
        // 避尾：行末的开标点移到下一行，最多回退到行首
        while (end > index + 1 && isOpeningPunctuation(cells[end - 1].char)) {
            end -= 1
        }
        const row = cells.slice(index, end).map((cell) => ({ ...cell }))
        // 避头：行首若为闭标点，挤进本行末格；可能连续多个
        while (end < cells.length && isClosingPunctuation(cells[end].char)) {
            const last = row[row.length - 1]
            if (!last) break
            last.trailing += cells[end].char
            end += 1
        }
        rows.push(row)
        index = end
    }
    return rows
}

/**
 * 居中排布一行：前导空格向上取整，留白为奇数时左侧多一格、右侧少一格。
 * 书法排版习惯让视觉重心略偏左，格数不能整除时不在右边缘留出孤立空白。
 */
function centerCells(cells: HandwritingCell[]): HandwritingCell[] {
    const leading = Math.max(
        0,
        Math.ceil((SHEET_COLUMNS - cells.length) / 2),
    )
    const padded = [
        ...Array.from({ length: leading }, () => createCell('')),
        ...cells,
    ]
    const tail = Math.max(0, SHEET_COLUMNS - padded.length)
    return [
        ...padded,
        ...Array.from({ length: tail }, () => createCell('')),
    ]
}

/** 右对齐一行：内容顶到末格，留白全部前置 */
function alignCellsRight(cells: HandwritingCell[]): HandwritingCell[] {
    const leading = Math.max(0, SHEET_COLUMNS - cells.length)
    return [
        ...Array.from({ length: leading }, () => createCell('')),
        ...cells,
    ]
}

/** 标题与副标题折行后逐行居中，超长标题同样受 14 行总容量约束 */
function buildCenteredRows(text: string): HandwritingCell[][] {
    if (!text.trim()) return []
    const cells = toCells(text, 'grid')
    return wrapCells(cells, SHEET_COLUMNS).map((row) => centerCells(row))
}

/** 署名行折行后逐行右对齐：短署名贴右边缘，超长署名首行满格、末行贴右 */
function buildRightRows(text: string): HandwritingCell[][] {
    if (!text.trim()) return []
    const cells = toCells(text, 'grid')
    return wrapCells(cells, SHEET_COLUMNS).map((row) => alignCellsRight(row))
}

/**
 * 节选署名：书名与作者合起来一行放得下就贴右边缘排一行；
 * 放不下则书名、作者各占一行，避免把书名或人名从中间拆开。
 */
function buildFooterRows(title: string, author: string): HandwritingCell[][] {
    if (!`${title}${author}`.trim()) return []
    const combined = toCells(`${title}${author}`, 'grid')
    if (combined.length <= SHEET_COLUMNS) return [alignCellsRight(combined)]
    return [...buildRightRows(title), ...buildRightRows(author)]
}

/**
 * 生成整页排版：标题、副标题、正文、署名依次占行，不足补空行，超出截断。
 * 返回值恒为 14 行 × 11 格，渲染层无需再做边界判定。
 */
export function buildHandwritingSheet(
    data: HandwritingSheetData,
    options: HandwritingLayoutOptions,
): HandwritingSheet {
    const isFooterTitle = options.titlePlacement === 'footer'
    const rows: HandwritingCell[][] = isFooterTitle
        ? []
        : [
              ...buildCenteredRows(data.title),
              ...buildCenteredRows(data.subtitle),
          ]
    const isCenterBody = options.bodyAlign === 'center'
    const bodyRows = data.lines.flatMap((line, index) => {
        const indent =
            index === 0 && options.indent > 0 && !line.startsWith(' ')
                ? ' '.repeat(options.indent)
                : ''
        const cells = toCells(`${indent}${line}`, options.punctuation)
        const wrapped = wrapCells(cells, SHEET_COLUMNS)
        // 古诗词逐句居中；节选折行后逐段居中会打乱跨行语义，故仅左对齐
        return isCenterBody ? wrapped.map((row) => centerCells(row)) : wrapped
    })
    rows.push(...bodyRows)
    // 节选的「书名 + 作者」紧接正文，右对齐收束全篇，顶部不再重复题名
    if (isFooterTitle) rows.push(...buildFooterRows(data.title, data.subtitle))

    const isOverflow = rows.length > SHEET_ROWS
    const visible = rows.slice(0, SHEET_ROWS)
    while (visible.length < SHEET_ROWS) visible.push(createBlankRow())

    return {
        rows: visible.map((row) => {
            const padded = row.slice(0, SHEET_COLUMNS)
            while (padded.length < SHEET_COLUMNS) padded.push(createCell(''))
            return padded
        }),
        isOverflow,
    }
}

/**
 * 解析语料 Markdown：`## 标题` 开启一条，紧随的 `> ` 引用行写朝代作者或出处，
 * 作者行之后不带前缀的普通文本行按出现顺序作为正文；正文仍写成 `> ` 的旧语料同样兼容。
 * 第一条引用若不含量句读且长度不超 20，才判定为朝代作者行或出处行，否则整体视为正文。
 * 其余（`#` 说明标题、跨行 HTML 注释、空行）一律忽略。
 */
export function parseHandwritingCorpus(markdown: string): HandwritingEntry[] {
    const entries: HandwritingEntry[] = []
    let current: {
        title: string
        quotes: string[]
        texts: string[]
    } | null = null
    let inComment = false

    const flush = () => {
        if (!current) return
        const quotes = current.quotes.filter((line) => line.length > 0)
        const texts = current.texts.filter((line) => line.length > 0)
        let subtitle = ''
        let lines: string[] = [...quotes, ...texts]
        const first = quotes[0]
        if (first && !/[，。、；：？！]/.test(first) && first.length <= 20) {
            subtitle = first
            lines = [...quotes.slice(1), ...texts]
        }
        if (lines.length > 0) {
            entries.push({ title: current.title, subtitle, lines })
        }
        current = null
    }

    for (const rawLine of markdown.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (inComment) {
            if (line.includes('-->')) inComment = false
            continue
        }
        if (!line) continue
        if (line.startsWith('<!--')) {
            if (!line.includes('-->')) inComment = true
            continue
        }
        const heading = /^##\s+(.+)$/.exec(line)
        if (heading) {
            flush()
            current = { title: heading[1].trim(), quotes: [], texts: [] }
            continue
        }
        if (!current) continue
        const quote = /^>\s?(.*)$/.exec(line)
        if (quote) {
            current.quotes.push(quote[1].trim())
            continue
        }
        // 说明性标题（如 `# 古诗词`）不是正文，其余普通行一律按正文收下
        if (line.startsWith('#')) continue
        current.texts.push(line)
    }
    flush()
    return entries
}

/** 节选筛选结果：入选随机池的条目与被剔除的条目分开返回，由调用方决定是否告警 */
export interface PassageFilterResult {
    entries: HandwritingEntry[]
    rejected: HandwritingEntry[]
}

/**
 * 筛选可用的节选条目：正文汉字数须在 20–40 之间，过短或过长都不入随机池。
 * 不在此处写控制台：shared 同时被浏览器与 Node 引用，自身 tsconfig 不含 DOM/Node 类型，
 * 告警交由调用方（页面 Hook）按运行环境处理。
 */
export function filterPassageEntries(
    entries: HandwritingEntry[],
): PassageFilterResult {
    const accepted: HandwritingEntry[] = []
    const rejected: HandwritingEntry[] = []
    for (const entry of entries) {
        const count = countHanzi(entry.lines.join(''))
        if (count < MIN_PASSAGE_CHARS || count > MAX_PASSAGE_CHARS) {
            rejected.push(entry)
        } else {
            accepted.push(entry)
        }
    }
    return { entries: accepted, rejected }
}

/** 从数组中随机取一项；空数组返回 null */
export function pickRandomEntry<T>(items: T[]): T | null {
    if (items.length === 0) return null
    return items[Math.floor(Math.random() * items.length)]
}

/** 版式种类：诗歌（题名居中、正文逐句居中）或节选（首行缩进、题名右对齐署名） */
export type LayoutKind = 'poem' | 'passage'

/**
 * 版式判定只看正文行数：多行按诗歌排版，单行按节选排版，与语料来源无关。
 * 空行不计数，避免语料末尾多余空行把单行节选误判成诗歌。
 */
export function resolveLayoutKind(lines: string[]): LayoutKind {
    const filled = lines.filter((line) => line.trim().length > 0)
    return filled.length > 1 ? 'poem' : 'passage'
}

/** 语料条目转字帖内容：标题与副标题原样保留，正文按行交给排版函数 */
export function toSheetData(entry: HandwritingEntry): HandwritingSheetData {
    return {
        title: entry.title,
        subtitle: entry.subtitle,
        lines: entry.lines,
    }
}
