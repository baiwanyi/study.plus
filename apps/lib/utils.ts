import type {
    TaskType,
    TaskStatus,
    TaskGrade,
    TaskClass,
    TaskAI,
    ExchangeStatus,
    PointRecordType,
    RelatedType,
} from '@apps/lib/types'
import { systemAPI } from '@apps/lib/api'

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
export function toTaskType(value: string): TaskType {
    return value === 'mindmap' ? 'mindmap' : 'composition'
}

export function toPointType(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger'
}

export function toPointSymbol(value: number): string {
    return value >= 0 ? '+' : '-'
}

export const taskTypeColors: Record<TaskType, string> = {
    composition: 'bg-purple-100 text-purple-800',
    mindmap: 'bg-pink-100 text-pink-800',
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
export const defaultGradeColors: Record<TaskGrade, string> = {
    'A+': 'bg-purple-100 text-purple-800',
    A: 'bg-emerald-100 text-emerald-800',
    B: 'bg-blue-100 text-blue-800',
    C: 'bg-amber-100 text-amber-800',
    D: 'bg-red-100 text-red-800',
    E: 'bg-gray-200 text-gray-800',
}

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

export const pointTypeColors: Record<PointRecordType, string> = {
    earn: 'badge-earn',
    deduct: 'badge-deduct',
}

export const pointColors: Record<PointRecordType, string> = {
    earn: 'text-success',
    deduct: 'text-danger',
}

export const pointBackgroundColors: Record<PointRecordType, string> = {
    earn: 'text-success bg-success-background',
    deduct: 'text-danger bg-danger-background',
}

export const pointSymbol: Record<PointRecordType, string> = {
    earn: '+',
    deduct: '-',
}
export const exchangeStatusValues = ['active', 'revoked'] as const
export const relatedTypeValues = [
    'task',
    'submission',
    'exam',
    'extra',
    'custom',
    'revoked',
] as const

export const relatedTypeLabels: Record<RelatedType, string> = {
    task: '作业',
    submission: '作业批改',
    exam: '单元测评',
    extra: '额外',
    custom: '自定义',
    revoked: '已撤销',
}

export const taskTypeValues = ['composition', 'mindmap'] as const
export const taskTypeLabels: Record<TaskType, string> = {
    composition: '作文',
    mindmap: '思维导图',
}

export const taskTypeDefaultTitles: Record<TaskType, string> = {
    mindmap: '未命名思维导图',
    composition: '未命名作文',
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
}

export function getCurrentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// Fetch runtime config from server (DB values override env defaults)
let _runtimeConfig: { pageSize?: number } = {}
let _configLoaded = false

export async function loadConfig(): Promise<void> {
    if (_configLoaded) return
    try {
        _runtimeConfig = await systemAPI.get()
        _configLoaded = true
    } catch {
        console.error('Failed to load runtime config from server')
    }
}

export function getPageSize(): number {
    return _runtimeConfig.pageSize ?? 20
}

export function paginate<T>(items: T[], page: number, pageSize?: number): T[] {
    const size = pageSize ?? getPageSize()
    const safePage = Math.max(1, page)
    return items.slice((safePage - 1) * size, safePage * size)
}

export function isAdmin(): boolean {
    const currentHostname = window.location.hostname
    return (
        currentHostname === 'localhost' ||
        currentHostname === '127.0.0.1' ||
        currentHostname === (import.meta.env.VITE_ADMIN_DOMAINS || '')
    )
}

export function formatErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : '未知错误'
}
