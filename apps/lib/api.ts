import {
    defaultExamRemark,
    defaultSubmissionRemark,
    defaultCustomRemark,
    defaultQuotes,
} from '@apps/lib/default'
import type {
    Task,
    Submission,
    PointRecord,
    Exchange,
    MonthSummary,
    PointStats,
    ShareStats,
    CreateTaskRequest,
    UpdateTaskRequest,
    SubmitTaskRequest,
    CreateExchangeRequest,
    AIScoreResult,
    AIUsageLog,
    AIUsageSummary,
    PointAdvance,
    CreateAdvanceRequest,
    AdvanceSummary,
    Video,
    ScanResult,
    WeeklyReport,
    WeeklyAnalysis,
    WeeklyConversation,
    WeeklyMessage,
} from '@apps/lib/types'
import type { WeeklyReportContent } from '@apps/lib/weekly'

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
    aiGenerateTitle: (type: string, grade: number) =>
        request<{ title: string }>('/tasks/ai-generate-title', {
            method: 'POST',
            body: JSON.stringify({ type, grade }),
        }),
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
    createByCustomRule: (ruleId: string, remark?: string) =>
        request<PointRecord>('/points/by-custom-rule', {
            method: 'POST',
            body: JSON.stringify({ ruleId, remark }),
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
    shareStats: (month?: string) => {
        const qs = month ? `?month=${month}` : ''
        return request<ShareStats>(`/points/share-stats${qs}`)
    },
    availableMonths: () => request<string[]>('/points/available-months'),
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

// ===== Options =====
export const optionsAPI = {
    get: (key: string) => request<unknown>(`/options/${key}`),
    update: (key: string, value: unknown) =>
        request<{ success: boolean }>(`/options/${key}`, {
            method: 'PUT',
            body: JSON.stringify(value),
        }),
}

// ===== Remark =====
interface RemarkOptions {
    exam: string
    submission: string
    custom: string
}

const defaultRemark: RemarkOptions = {
    exam: defaultExamRemark.join('\n'),
    submission: defaultSubmissionRemark.join('\n'),
    custom: defaultCustomRemark.join('\n'),
}

export const remarkApi = {
    get: async (): Promise<RemarkOptions> => {
        try {
            const data = await optionsAPI.get('remark')
            if (data && typeof data === 'object') {
                const option = data as Partial<RemarkOptions>
                return {
                    exam: option.exam ?? defaultRemark.exam,
                    submission: option.submission ?? defaultRemark.submission,
                    custom: option.custom ?? defaultRemark.custom,
                }
            }
        } catch {
            // Return defaults on error
        }
        return defaultRemark
    },
    update: async (options: RemarkOptions) => {
        await optionsAPI.update('remark', options)
    },
}

// ===== Quotes =====
export const quotesApi = {
    get: async (): Promise<string[]> => {
        try {
            const data = await optionsAPI.get('quotes')
            // Handle both plain array and {quotes: [...]} format
            if (Array.isArray(data)) return data as string[]
            if (data && typeof data === 'object' && 'quotes' in data) {
                const option = data as { quotes: string[] }
                if (Array.isArray(option.quotes)) return option.quotes
            }
        } catch {
            // Return defaults on error
        }
        return defaultQuotes
    },
    update: async (quotes: string[]) => {
        await optionsAPI.update('quotes', quotes)
    },
}

// ===== System =====
export const systemAPI = {
    get: () => request<AppConfig>('/system'),
}

// ===== Images =====
export const imagesApi = {
    list: () => request<string[]>('/images'),
}

// ===== Advances =====
export const advancesApi = {
    list: () => request<PointAdvance[]>('/points/advances'),
    summary: () => request<AdvanceSummary>('/points/advances/summary'),
    create: (data: CreateAdvanceRequest) =>
        request<PointAdvance>('/points/advances', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
}

// ===== AI Usage =====
export const aiUsageApi = {
    list: () => request<AIUsageLog[]>('/ai-usage'),
    summary: () => request<AIUsageSummary[]>('/ai-usage/summary'),
}

// ===== RSS =====
export interface RssFeedItem {
    id: number
    title: string
    link: string
    pubDate: string
    excerpt: string
    image?: string
}

export interface RssPostDetail {
    id: number
    title: string
    content: string
    date: string
    excerpt: string
}

export const rssApi = {
    list: (cat?: number) => {
        const qs = cat ? `?cat=${cat}` : ''
        return request<{ items: RssFeedItem[] }>(`/rss/feed${qs}`)
    },
    getPost: (id: number) => request<RssPostDetail>(`/rss/post/${id}`),
}

// ===== Weekly Reports =====
export const weeklyApi = {
    list: (year?: number) => {
        const qs = year ? `?year=${year}` : ''
        return request<WeeklyReport[]>(`/weekly${qs}`)
    },
    create: (data: {
        weekNumber: number
        year: number
        content: WeeklyReportContent
    }) =>
        request<WeeklyReport>('/weekly', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: number, data: { content: WeeklyReportContent }) =>
        request<WeeklyReport>(`/weekly/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),
    delete: (id: number) =>
        request<void>(`/weekly/${id}`, { method: 'DELETE' }),
    analyze: (id: number) =>
        request<{ analysis: WeeklyAnalysis }>(`/weekly/${id}/analyze`, {
            method: 'POST',
        }),
    chat: (id: number, message: string) =>
        request<{ reply: string }>(`/weekly/${id}/chat`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        }),
    getConversation: (id: number) =>
        request<{
            conversation: WeeklyConversation | null
            messages: WeeklyMessage[]
        }>(`/weekly/${id}/conversation`),
}

// ===== Videos =====
export const videosApi = {
    list: (limit?: number, favorite?: number) => {
        const params = new URLSearchParams()
        if (limit && limit > 0) params.set('limit', String(limit))
        if (favorite === 1) params.set('favorite', '1')
        const qs = params.toString() ? `?${params.toString()}` : ''
        return request<Video[]>(`/videos${qs}`)
    },
    listFavorites: () => request<Video[]>('/videos?favorite=1'),
    get: (md5: string) => request<Video>(`/videos/${md5}`),
    scan: () => request<ScanResult>('/videos/scan', { method: 'POST' }),
    /** 流式扫描，带进度回调 */
    scanWithProgress: async (
        onProgress: (current: number, total: number) => void,
    ): Promise<ScanResult> => {
        const res = await fetch(`${BASE}/videos/scan`, { method: 'POST' })
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }))
            throw new Error(err.error || `扫描失败: ${res.status}`)
        }
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        return new Promise((resolve, reject) => {
            const pump = () => {
                reader.read().then(({ done, value }) => {
                    if (done) return
                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split('\n')
                    buffer = lines.pop() || '' // 保留不完整的行
                    for (const line of lines) {
                        if (!line.trim()) continue
                        try {
                            const data = JSON.parse(line)
                            if (data.type === 'progress') {
                                onProgress(data.current, data.total)
                            } else if (data.type === 'complete') {
                                resolve({
                                    total: data.total,
                                    new: data.new,
                                    skipped: data.skipped,
                                    deleted: data.deleted ?? 0,
                                    errors: data.errors,
                                })
                            } else if (data.type === 'error') {
                                reject(new Error(data.message))
                            }
                        } catch { /* skip malformed line */ }
                    }
                    pump()
                }).catch(reject)
            }
            pump()
        })
    },
    updateTitle: (md5: string, title: string) =>
        request<Video>(`/videos/${md5}`, {
            method: 'PUT',
            body: JSON.stringify({ title }),
        }),
    addView: (md5: string) =>
        request<{ success: boolean }>(`/videos/${md5}/view`, { method: 'POST' }),
    saveResumeTime: (md5: string, time: number) =>
        request<{ success: boolean }>(`/videos/${md5}/resume-time`, {
            method: 'PUT',
            body: JSON.stringify({ time }),
        }),
    toggleFavorite: (md5: string) =>
        request<Video>(`/videos/${md5}/toggle-favorite`, { method: 'POST' }),
    streamUrl: (md5: string) => `${BASE}/videos/stream/${md5}`,
}
