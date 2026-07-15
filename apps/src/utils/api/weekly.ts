'use client'

import { request } from './request'
import type { WeeklyReportContent } from '@shared/weekly'
import type {
    WeeklyAnalysis,
    WeeklyConversation,
    WeeklyMessage,
    WeeklyReport,
} from '@shared/types'

function assertValidId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`无效的周报 ID: ${id}`)
    }
}

export const weeklyApi = {
    list: (year?: number) => {
        const qs = year != null && Number.isInteger(year) && year > 0
            ? `?year=${year}`
            : ''
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
    update: (id: number, data: { content: WeeklyReportContent }) => {
        assertValidId(id)
        return request<WeeklyReport>(`/weekly/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertValidId(id)
        return request<void>(`/weekly/${id}`, { method: 'DELETE' })
    },
    analyze: (id: number) => {
        assertValidId(id)
        return request<{ analysis: WeeklyAnalysis }>(`/weekly/${id}/analyze`, {
            method: 'POST',
        })
    },
    chat: (id: number, message: string) => {
        assertValidId(id)
        return request<{ reply: string }>(`/weekly/${id}/chat`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        })
    },
    getConversation: (id: number) => {
        assertValidId(id)
        return request<{
            conversation: WeeklyConversation | null
            messages: WeeklyMessage[]
        }>(`/weekly/${id}/conversation`)
    },
}
