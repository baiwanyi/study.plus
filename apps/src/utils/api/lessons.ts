'use client'

import { request } from './request'
import type {
    PreviewAnalysis,
    StudyLesson,
    StudyLessonWithStatus,
    StudyPreview,
    StudyPreviewCreateRequest,
    StudynotesItem,
} from '@shared/types'

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`无效的${field}: ${value}`)
    }
}

export const lessonsApi = {
    list: (params?: Record<string, string>) => {
        const qs =
            params && Object.keys(params).length > 0
                ? '?' +
                  new URLSearchParams(
                      Object.fromEntries(
                          Object.entries(params).filter(
                              ([, value]) =>
                                  value !== undefined && value !== null,
                          ),
                      ),
                  ).toString()
                : ''
        return request<StudyLessonWithStatus[]>(`/lessons${qs}`)
    },
    create: (data: { subject: string; topic: string }) =>
        request<StudyLesson>('/lessons', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: number, data: { subject: string; topic: string }) => {
        assertPositiveInt(id, '课程 ID')
        return request<StudyLesson>(`/lessons/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertPositiveInt(id, '课程 ID')
        return request<{ success: boolean }>(`/lessons/${id}`, {
            method: 'DELETE',
        })
    },
    getPreview: (lessonId: number) => {
        assertPositiveInt(lessonId, '课程 ID')
        return request<{ preview: StudyPreview | null }>(
            `/lessons/${lessonId}/preview`,
        )
    },
    savePreview: (lessonId: number, data: StudyPreviewCreateRequest) => {
        assertPositiveInt(lessonId, '课程 ID')
        return request<StudyPreview>(`/lessons/${lessonId}/preview`, {
            method: 'POST',
            body: JSON.stringify(data),
        })
    },
    analyzePreview: (lessonId: number) => {
        assertPositiveInt(lessonId, '课程 ID')
        return request<{
            analysis: PreviewAnalysis
            analyzedAt: string
        }>(`/lessons/${lessonId}/preview/analyze`, { method: 'POST' })
    },
    getStudynote: (lessonId: number) => {
        assertPositiveInt(lessonId, '课程 ID')
        return request<{ studynote: StudynotesItem | null }>(
            `/lessons/${lessonId}/studynote`,
        )
    },
}
