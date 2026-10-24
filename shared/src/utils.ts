/**
 * 前后端共享工具：格式化、编码与文案映射，以及题库 Markdown 的结构解析。
 * 复用约定：前后端一律从 @shared/utils 引入，禁止各自复制同一份实现；
 * 题库的「答案段切分」与「小题块解析」也在此提供，使服务端取题与前端渲染共用同一套索引口径。
 * 关键约束：只允许纯函数与纯数据，不得引入 DOM 或 Node 专属 API；
 * 解析须跳过围栏代码块，且不改变行数，避免与渲染期预处理（选项换行、公式归一化）产生行错位。
 */
import type {
    ExchangeStatus,
    PointRecordType,
    RelatedType,
    TaskAI,
    TaskClass,
    TaskStatus,
    TaskType,
} from './types'

export function formatDate(iso: string | null): string {
    if (!iso) return '-'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatNumber(n: number): string {
    return n.toLocaleString()
}

/** Normalize any value to a valid TaskType, defaulting to 'composition' */
export function toTaskType(value: string | null | undefined): TaskType {
    if (!value) return 'composition'
    return (taskTypeValues as readonly string[]).includes(value)
        ? (value as TaskType)
        : 'composition'
}

export function toPointType(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger'
}

export function toPointSymbol(value: number): string {
    return value >= 0 ? '+' : '-'
}

export const taskStatus = ['pending', 'completed', 'expired'] as const
export const taskStatusLabels: Record<TaskStatus, string> = {
    pending: '待完成',
    completed: '已完成',
    expired: '已过期',
}
export const taskStatusColors: Record<TaskStatus, string> = {
    pending: 'badge-pending',
    completed: 'badge-completed',
    expired: 'badge-expired',
}

export const defaultGradeValues = ['A+', 'A', 'B', 'C', 'D', 'E'] as const
export const exchangeStatusLabels: Record<ExchangeStatus, string> = {
    active: '有效',
    revoked: '已撤销',
}

export const exchangeStatusColors: Record<ExchangeStatus, string> = {
    active: 'badge-active',
    revoked: 'badge-revoked',
}

export const pointTypeLabels: Record<PointRecordType, string> = {
    earn: '加分',
    deduct: '扣分',
}

export const exchangeStatusValues = ['active', 'revoked'] as const
export const relatedTypeValues = [
    'task',
    'submission',
    'exam',
    'extra',
    'custom',
    'exchange',
    'revoked',
    'advance',
] as const

export const relatedTypeLabels: Record<RelatedType, string> = {
    task: '作业',
    submission: '作业批改',
    exam: '单元测评',
    extra: '额外',
    custom: '自定义',
    exchange: '积分兑换',
    revoked: '已撤销',
    advance: '积分预支',
}

export const studynotesSubjectLabels: Record<string, string> = {
    math: '数学',
    chinese: '语文',
    english: '英语',
    science: '科学',
    custom: '自定义',
}

export const studynotesSubjectValues = ['math', 'chinese', 'english'] as const

export const taskTypeValues = ['composition', 'mindmap', 'notes'] as const
export const taskTypeLabels: Record<TaskType, string> = {
    composition: '作文',
    mindmap: '思维导图',
    notes: '读书笔记',
}

export const taskTypeDefaultTitles: Record<TaskType, string> = {
    mindmap: '未命名思维导图',
    composition: '未命名作文',
    notes: '未命名读书笔记',
}

export const taskClassLabels: TaskClass[] = [
    '未定级',
    '一年级',
    '二年级',
    '三年级',
    '四年级',
    '五年级',
    '六年级',
]

export const taskAILabels: Record<TaskAI, string> = {
    'ai-score': '作业评分',
    'ai-title': '作业起名',
    'ai-task': '作业出题',
    'task-chat': '作业对话',
    'weekly-analyze': '周报分析',
    'weekly-chat': '周报对话',
    'preview-analyze': '预习分析',
    'notes-evaluate': '心得评估',
    'quiz-question': '测验出题',
    'quiz-marking': '测验批改',
    'library-hint': '题目思路',
}

export function getCurrentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
    const safePage = Math.max(1, page)
    return items.slice((safePage - 1) * pageSize, safePage * pageSize)
}

export function formatErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : '未知错误'
}

/** 多选：['A','C','D'] -> 'A,C,D'（去重、升序、逗号分隔），供答案编码与展示还原共用 */
export function encodeMultiSelection(selected: string[]): string {
    const unique = [...new Set(selected.map((s) => s.trim()))]
    return unique.sort().join(',')
}

/** 多选：'A,C,D' -> ['A','C','D']；空串/非法输入返回 [] */
export function decodeMultiSelection(raw: string): string[] {
    if (!raw.trim()) return []
    return raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]$/.test(s))
}

// ===== 题库 Markdown 结构解析 =====
// 题干与答案的切分、小题块的划分都在此完成：服务端据此取「某一小题的题干」发给 AI，
// 前端据此渲染每道小题及其按钮，两端索引因此天然一致，不会出现「点了第 3 题、AI 讲第 2 题」。

/** 围栏代码块起始标记：``` 或 ~~~ */
const LIBRARY_FENCE = /^\s{0,3}(`{3,}|~{3,})/
/** 答案区标题行：1–6 级标题且整行含「参考答案」 */
const LIBRARY_ANSWER_HEADING = /^#{1,6}[ \t]+.*参考答案/
/** 卷首或大题标题行：1–6 级 Markdown 标题 */
const LIBRARY_HEADING = /^[ \t]{0,3}#{1,6}[ \t]+\S/
/** 水平分隔线：独占一行且仅由 - * _ 组成 */
const LIBRARY_DIVIDER = /^[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*$/
/** 小题起始行：`1.` `1、` `1)` `（1）` 四种编号写法，编号后必须紧跟题目内容 */
const LIBRARY_QUESTION_START =
    /^[ \t]{0,3}(?:(\d{1,3})[.、．)）]|[（(](\d{1,3})[）)])[ \t]*(\S.*)$/
/** 解题思路区块的起始标记：独立成行，机器可识别，渲染时作为 HTML 注释被丢弃 */
const LIBRARY_HINTS_MARK = '<!-- library-hints:start -->'
/** 单题思路的分隔标记：`<!-- hint:3 -->`，数字为块索引 */
const LIBRARY_HINT_ITEM = /^<!--[ \t]*hint:(\d{1,4})[ \t]*-->$/
/** 思路区自身的二级标题行，用于与「区块之后的其它章节」区分 */
const LIBRARY_HINTS_HEADING = /^##[ \t]+.*解题思路/

export interface LibraryArticle {
    /** 题干部分：答案标题之前的全部内容，已去掉尾部分隔线与空行 */
    question: string
    /** 答案部分：答案标题及其后内容；未声明答案时为 null */
    answer: string | null
}

export interface LibraryQuestionBlock {
    /** 块在题干内的顺序索引（从 0 开始），前端按钮与后端取题共用同一索引 */
    index: number
    /** question：可单独求助的小题；text：卷首说明、大题标题等不归属任何小题的内容 */
    kind: 'question' | 'text'
    /** 原卷题号（如 '1'）；text 块与「整篇降级」生成的题块为 null */
    number: string | null
    /** 所属大题标题（去掉分值说明后的纯文本）；用于思路条目标题，无大题时为 null */
    section: string | null
    /** 该块的 Markdown 内容；小题块的题号前缀已被剥离，避免渲染时重复编号 */
    content: string
}

export interface LibraryHintEntry {
    /** 对应小题块的索引 */
    index: number
    /** 条目正文：包含 `### 第 N 题` 标题行在内的完整 Markdown，写回时原样保留 */
    markdown: string
}

export interface LibraryHintsSplit {
    /** 剔除思路区后的正文（思路区之前的内容） */
    body: string
    /** 思路区之后若还有其它章节则原样保留，写回时不得丢失 */
    tail: string
    /** 已保存的各题思路，key 为小题块索引 */
    hints: Map<number, LibraryHintEntry>
}

/** 从标题行提取小节名：去掉 `#` 前缀与「（每空2分，共20分）」这类分值说明 */
function normalizeSection(line: string): string | null {
    const text = line.replace(/^[ \t]{0,3}#{1,6}[ \t]+/, '').trim()
    if (!text) return null
    const bracket = text.indexOf('（')
    const name = bracket > 0 ? text.slice(0, bracket).trim() : text
    return name || null
}

/** 裁掉首尾空行，保留块内空行（题目与选项之间的空行属于排版，不可丢） */
function trimBlankEdge(lines: string[]): string[] {
    let start = 0
    let end = lines.length
    while (start < end && lines[start].trim() === '') start += 1
    while (end > start && lines[end - 1].trim() === '') end -= 1
    return lines.slice(start, end)
}

/**
 * 按「参考答案」标题把题目切成题干与答案两段，答案段交给调用方决定是否展示。
 * 关键约束：识别依据是行首的 Markdown 标题（1–6 级）且整行含「参考答案」，
 * 只有占位声明而无实际答案时按「无答案」处理；题干尾部的 `---` 分隔线须一并去掉，
 * 否则折叠后题干末尾会残留一条水平线。
 */
export function splitLibraryAnswer(markdown: string): LibraryArticle {
    const lines = markdown.split('\n')
    let fenceMarker: string | null = null

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const fenceMatched = LIBRARY_FENCE.exec(line)

        if (fenceMarker !== null) {
            if (fenceMatched && fenceMatched[1][0] === fenceMarker) {
                fenceMarker = null
            }
            continue
        }
        if (fenceMatched) {
            fenceMarker = fenceMatched[1][0]
            continue
        }
        if (!LIBRARY_ANSWER_HEADING.test(line)) continue

        const answer = lines.slice(index).join('\n').trim()
        if (!lines.slice(index + 1).join('\n').trim()) {
            return { question: markdown, answer: null }
        }
        const head = lines.slice(0, index)
        while (head.length > 0) {
            const tail = head[head.length - 1].trim()
            if (tail === '' || /^-{3,}$/.test(tail)) {
                head.pop()
                continue
            }
            break
        }
        return { question: head.join('\n'), answer }
    }

    return { question: markdown, answer: null }
}

/**
 * 把题干拆成「小题块 + 文本块」，供前端逐题渲染按钮、服务端按索引取题。
 * 关键约束：小题以行首编号识别，块在下一个编号/标题/分隔线处结束；
 * 卷首说明与大题标题归入 text 块（不参与求助）；分隔线只作分界不进任何块；
 * 一段小题都识别不到时（如纯段落式题集）降级为「整篇一个题块」，索引固定为 0。
 */
export function parseLibraryQuestions(question: string): LibraryQuestionBlock[] {
    interface DraftBlock {
        kind: 'question' | 'text'
        number: string | null
        section: string | null
        lines: string[]
    }

    const drafts: DraftBlock[] = []
    let fenceMarker: string | null = null
    let current: DraftBlock | null = null
    // 最近一次遇到的标题即为后续小题所属的大题；卷首一级标题会先占位，随后被大题标题覆盖
    let section: string | null = null

    const flush = () => {
        if (!current) return
        const lines = trimBlankEdge(current.lines)
        if (lines.length > 0) {
            drafts.push({ ...current, lines })
        }
        current = null
    }

    const append = (line: string) => {
        if (!current) {
            // 块间空行不单独成块，否则题干会被切成大量空段
            if (line.trim() === '') return
            current = { kind: 'text', number: null, section, lines: [] }
        }
        current.lines.push(line)
    }

    for (const line of question.split('\n')) {
        const fenceMatched = LIBRARY_FENCE.exec(line)

        if (fenceMarker !== null) {
            if (fenceMatched && fenceMatched[1][0] === fenceMarker) {
                fenceMarker = null
            }
            append(line)
            continue
        }
        if (fenceMatched) {
            fenceMarker = fenceMatched[1][0]
            append(line)
            continue
        }

        const questionStart = LIBRARY_QUESTION_START.exec(line)
        if (questionStart) {
            flush()
            current = {
                kind: 'question',
                number: questionStart[1] ?? questionStart[2],
                section,
                lines: [questionStart[3]],
            }
            continue
        }
        if (LIBRARY_HEADING.test(line)) {
            flush()
            section = normalizeSection(line)
            current = { kind: 'text', number: null, section, lines: [line] }
            continue
        }
        if (LIBRARY_DIVIDER.test(line)) {
            flush()
            continue
        }
        append(line)
    }
    flush()

    const hasQuestion = drafts.some((draft) => draft.kind === 'question')
    const source: DraftBlock[] = hasQuestion
        ? drafts
        : [{ kind: 'question', number: null, section: null, lines: question.split('\n') }]

    // 先按内容裁剪并丢弃空块，再统一编号，避免空块导致索引出现空洞
    const blocks = source
        .map((draft) => ({
            kind: draft.kind,
            number: draft.number,
            section: draft.section,
            content: draft.lines.join('\n').trim(),
        }))
        .filter((block) => block.content.length > 0)

    return blocks.map((block, index) => ({ ...block, index }))
}

/**
 * 切出文档末尾的「解题思路」区，供渲染与写回共用。
 * 关键约束：区块以 `<!-- library-hints:start -->` 标记起始，到下一个其它二级标题或文件尾结束，
 * 区块之后若还有其它章节必须落到 tail 中，写回时原样保留，不得吞掉用户后续内容；
 * 单题条目以 `<!-- hint:N -->` 分隔，N 为小题块索引；重复索引以后出现的为准。
 */
export function splitLibraryHints(markdown: string): LibraryHintsSplit {
    const hints = new Map<number, LibraryHintEntry>()
    const lines = markdown.replace(/\r\n/g, '\n').split('\n')

    let markIndex = -1
    let fenceMarker: string | null = null
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        const fenceMatched = LIBRARY_FENCE.exec(line)

        if (fenceMarker !== null) {
            if (fenceMatched && fenceMatched[1][0] === fenceMarker) {
                fenceMarker = null
            }
            continue
        }
        if (fenceMatched) {
            fenceMarker = fenceMatched[1][0]
            continue
        }
        if (line.trim() === LIBRARY_HINTS_MARK) {
            markIndex = index
            break
        }
    }

    if (markIndex < 0) {
        return { body: markdown, tail: '', hints }
    }

    // 区块结束位置：标记之后第一个不属于思路区自身的二级标题
    let endIndex = lines.length
    for (let index = markIndex + 1; index < lines.length; index += 1) {
        if (!/^##[ \t]+\S/.test(lines[index])) continue
        if (LIBRARY_HINTS_HEADING.test(lines[index])) continue
        endIndex = index
        break
    }

    let currentIndex: number | null = null
    let currentLines: string[] = []
    const flushItem = () => {
        if (currentIndex === null) return
        const entry = trimBlankEdge(currentLines).join('\n').trim()
        if (entry) hints.set(currentIndex, { index: currentIndex, markdown: entry })
        currentIndex = null
        currentLines = []
    }

    for (let index = markIndex + 1; index < endIndex; index += 1) {
        const matched = LIBRARY_HINT_ITEM.exec(lines[index].trim())
        if (matched) {
            flushItem()
            currentIndex = Number(matched[1])
            continue
        }
        if (currentIndex === null) continue
        currentLines.push(lines[index])
    }
    flushItem()

    return {
        body: trimBlankEdge(lines.slice(0, markIndex)).join('\n'),
        tail: trimBlankEdge(lines.slice(endIndex)).join('\n'),
        hints,
    }
}

/** 拼接单题条目的 Markdown：标题行用于人读，索引由分隔标记承载 */
function buildHintMarkdown(
    number: string | null,
    section: string | null,
    content: string,
): string {
    const subject = number ? `第 ${number} 题` : '整篇题目'
    const heading = section ? `### ${section} · ${subject}` : `### ${subject}`
    return `${heading}\n\n${content.trim()}`
}

/**
 * 把某道小题的思路写入文档：已有同名索引则覆盖，其余条目与思路区之后的章节原样保留。
 * 关键约束：写回前先归一化 CRLF，写完再按原文件风格还原，避免出现混合行尾；
 * 条目按索引升序重排，索引本身是稳定键，去掉标题行也不会影响定位。
 */
export function upsertLibraryHint(
    markdown: string,
    entry: { index: number; number: string | null; section: string | null; content: string },
): string {
    const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
    const { body, tail, hints } = splitLibraryHints(markdown)

    hints.set(entry.index, {
        index: entry.index,
        markdown: buildHintMarkdown(entry.number, entry.section, entry.content),
    })

    const items = [...hints.values()]
        .sort((a, b) => a.index - b.index)
        .flatMap((hint) => [`<!-- hint:${hint.index} -->`, hint.markdown, ''])

    const block = [LIBRARY_HINTS_MARK, '## 解题思路', '', ...items].join('\n')
    const parts = [body, block, tail].filter((part) => part.trim() !== '')
    const result = `${parts.join('\n\n')}\n`

    return eol === '\n' ? result : result.replace(/\n/g, eol)
}

/**
 * 去掉条目标题行，供前端在已有题号与上下文的面板里只渲染正文。
 * 只识别写回时生成的两种标题（`### … 第 N 题` / `### 整篇题目`），
 * 不会误删 AI 正文自身的 `### 一、读懂题目` 等小节标题。
 */
export function stripLibraryHintHeading(markdown: string): string {
    return markdown
        .replace(/^###[ \t]+[^\n]*(?:第\s*\d+\s*题|整篇题目)[ \t]*\n+/, '')
        .trim()
}

/**
 * 思路是否完整：提示词固定输出五节，末节为「自查清单」。
 * 用于提示历史保存的内容可能因 max_tokens 截断而中途断掉——不据此自动重新生成，
 * 只在前端给出提示，由用户决定是否点「换一种思路」覆盖。
 */
export function isLibraryHintComplete(markdown: string): boolean {
    return /自查清单/.test(markdown)
}
