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

export const feynmanSubjectLabels: Record<string, string> = {
    math: '数学',
    chinese: '语文',
    english: '英语',
}

export const feynmanSubjectValues = ['math', 'chinese', 'english'] as const

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
    'ai-score': 'AI评分',
    'ai-title': 'AI起名',
    'ai-task': 'AI出题',
    'task-chat': 'AI作业对话',
    'weekly-analyze': 'AI周报分析',
    'weekly-chat': 'AI周报对话',
    'feynman-followup': 'AI费曼跟进',
    'feynman-evaluate': 'AI费曼评估',
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
