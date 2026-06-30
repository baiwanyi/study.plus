export {
    formatDate,
    formatNumber,
    toTaskType,
    toPointType,
    toPointSymbol,
    taskStatus,
    taskStatusLabels,
    defaultGradeValues,
    exchangeStatusLabels,
    exchangeStatusColors,
    pointTypeLabels,
    exchangeStatusValues,
    relatedTypeValues,
    relatedTypeLabels,
    taskTypeValues,
    taskTypeLabels,
    taskTypeDefaultTitles,
    taskClassLabels,
    taskAILabels,
    getCurrentMonth,
    paginate,
    formatErrorMessage,
} from '@shared/utils'

export type {
    TaskType,
    TaskStatus,
    TaskGrade,
    ExchangeStatus,
    PointRecordType,
    RelatedType,
} from '@shared/types'

export const taskTypeColors: Record<string, string> = {
    composition: 'bg-purple-100 text-purple-800',
    mindmap: 'bg-pink-100 text-pink-800',
    notes: 'bg-green-100 text-green-800',
    math: 'bg-blue-100 text-blue-800',
    english: 'bg-orange-100 text-orange-800',
}

export const taskStatusColors: Record<string, string> = {
    pending: 'badge-pending',
    completed: 'badge-completed',
    expired: 'badge-expired',
}

export const defaultGradeColors: Record<string, string> = {
    'A+': 'bg-purple-100 text-purple-800',
    A: 'bg-emerald-100 text-emerald-800',
    B: 'bg-blue-100 text-blue-800',
    C: 'bg-amber-100 text-amber-800',
    D: 'bg-red-100 text-red-800',
    E: 'bg-gray-200 text-gray-800',
}

export const pointTypeColors: Record<string, string> = {
    earn: 'badge-earn',
    deduct: 'badge-deduct',
}

export const pointColors: Record<string, string> = {
    earn: 'text-success',
    deduct: 'text-danger',
}

export const pointBackgroundColors: Record<string, string> = {
    earn: 'text-success bg-success-background',
    deduct: 'text-danger bg-danger-background',
}

export const pointSymbol: Record<string, string> = {
    earn: '+',
    deduct: '-',
}

let _runtimeConfig: { pageSize?: number } = {}
let _configLoaded = false

export async function loadConfig(): Promise<void> {
    if (_configLoaded) return
    try {
        const { systemAPI } = await import('@apps/api')
        _runtimeConfig = await systemAPI.get()
        _configLoaded = true
    } catch {
        console.error('Failed to load runtime config from server')
    }
}

export function getPageSize(): number {
    return _runtimeConfig.pageSize ?? 20
}

export function isAdmin(): boolean {
    const currentHostname = window.location.hostname
    return (
        currentHostname === 'localhost' ||
        currentHostname === '127.0.0.1' ||
        currentHostname === (import.meta.env.VITE_ADMIN_DOMAINS || '')
    )
}
