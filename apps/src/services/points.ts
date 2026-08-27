'use client'

import { request } from './request'
import type {
    MonthSummary,
    PointRecord,
    PointStats,
    ShareStats,
} from '@shared/types'

export const pointsApi = {
    list: (params?: Record<string, string>) => {
        const qs = params && Object.keys(params).length > 0
            ? '?' + new URLSearchParams(params).toString()
            : ''
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
        const qs = month != null && month.trim() !== '' ? `?month=${month}` : ''
        return request<PointStats>(`/points/stats${qs}`)
    },
    shareStats: (month?: string) => {
        const qs = month != null && month.trim() !== '' ? `?month=${month}` : ''
        return request<ShareStats>(`/points/share-stats${qs}`)
    },
    availableMonths: () => request<string[]>('/points/available-months'),
}
