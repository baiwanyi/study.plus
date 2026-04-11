import type {
    Task,
    Submission,
    PointRecord,
    Exchange,
    MonthSummary,
    PointStats,
    CreateTaskRequest,
    UpdateTaskRequest,
    SubmitTaskRequest,
    CreateExchangeRequest,
    AIScoreResult,
    AIUsageLog,
    AIUsageSummary,
} from '@apps/lib/types'

const BASE = '/api'

interface AppConfig {
    autosaveInterval: number
    pageSize: number
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
    const { headers: customHeaders, ...restOptions } = options ?? {}
    const res = await fetch(`${BASE}${url}`, {
        ...restOptions,
        headers: {
            'Content-Type': 'application/json',
            ...customHeaders,
        },
    })
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `Request failed: ${res.status}`)
    }
    return res.json()
}

// ===== Tasks =====
export const tasksApi = {
    list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<Task[]>(`/tasks${qs}`)
    },
    create: (data: CreateTaskRequest) =>
        request<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: UpdateTaskRequest) =>
        request<Task>(`/tasks/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    delete: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
    submit: (id: number, data: SubmitTaskRequest) =>
        request<{ submission: Submission }>(`/tasks/${id}/submit`, {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    aiScore: (id: number) =>
        request<{
            submission: Submission
            aiResult: AIScoreResult
            pointsEarned: number
        }>(`/tasks/${id}/ai-score`, { method: 'POST' }),
    aiTitle: (id: number) =>
        request<{ title: string }>(`/tasks/${id}/ai-title`, { method: 'POST' }),
}

// ===== Points =====
export const pointsApi = {
    list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<PointRecord[]>(`/points${qs}`)
    },
    createByGrade: (category: string, grade: string, remark?: string) =>
        request<PointRecord>('/points/by-grade', {
            method: 'POST',
            body: JSON.stringify({ category, grade, remark }),
        }),
    createByCustomRule: (ruleId: string) =>
        request<PointRecord>('/points/by-custom-rule', {
            method: 'POST',
            body: JSON.stringify({ ruleId }),
        }),
    createByExamScore: (score: number, remark?: string) =>
        request<PointRecord>('/points/by-exam-score', {
            method: 'POST',
            body: JSON.stringify({ score, remark }),
        }),
    summary: () => request<MonthSummary>('/points/summary'),
    stats: (month?: string) => {
        const qs = month ? `?month=${month}` : ''
        return request<PointStats>(`/points/stats${qs}`)
    },
}

// ===== Exchanges =====
export const exchangesApi = {
    list: (params?: Record<string, string>) => {
        const qs = params ? '?' + new URLSearchParams(params).toString() : ''
        return request<Exchange[]>(`/exchanges${qs}`)
    },
    create: (data: CreateExchangeRequest) =>
        request<Exchange>('/exchanges', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    revoke: (id: number) =>
        request<Exchange>(`/exchanges/${id}/revoke`, { method: 'POST' }),
}

// ===== Rules =====
export const rulesApi = {
    get: (key: string) => request<unknown>(`/rules/${key}`),
    update: (key: string, value: unknown) =>
        request<{ success: boolean }>(`/rules/${key}`, {
            method: 'PUT',
            body: JSON.stringify(value),
        }),
}

// ===== Config =====
export const configApi = {
    get: () => request<AppConfig>('/config'),
}

// ===== AI Usage =====
export const aiUsageApi = {
    list: () => request<AIUsageLog[]>('/ai-usage'),
    summary: () => request<AIUsageSummary[]>('/ai-usage/summary'),
}
