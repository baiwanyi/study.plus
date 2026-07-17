'use client'

import { request } from './request'
import type {
    StudynotesCard,
    StudynotesCreateRequest,
    StudynotesEvaluation,
    StudynotesMessage,
} from '@shared/types'

function assertValidId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`无效的学习心得 ID: ${id}`)
    }
}

export const studynotesApi = {
    list: (params?: Record<string, string>) => {
        const qs =
            params && Object.keys(params).length > 0
                ? '?' + new URLSearchParams(params).toString()
                : ''
        return request<StudynotesCard[]>(`/studynotes${qs}`)
    },
    get: (id: number) => {
        assertValidId(id)
        return request<StudynotesCard>(`/studynotes/${id}`)
    },
    create: (data: StudynotesCreateRequest) =>
        request<StudynotesCard>('/studynotes', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (
        id: number,
        data: Omit<Partial<StudynotesCreateRequest>, 'memoryHook'> & {
            memoryHook?: string | null
        },
    ) => {
        assertValidId(id)
        return request<StudynotesCard>(`/studynotes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertValidId(id)
        return request<{ success: boolean }>(`/studynotes/${id}`, {
            method: 'DELETE',
        })
    },
    evaluate: (id: number) => {
        assertValidId(id)
        return request<{
            evaluation: StudynotesEvaluation
            evaluatedAt: string
        }>(`/studynotes/${id}/evaluate`, { method: 'POST' })
    },
    followUp: (id: number, message?: string) => {
        assertValidId(id)
        const options: RequestInit = { method: 'POST' }
        if (message) {
            options.body = JSON.stringify({ message })
        }
        return request<{ messages: StudynotesMessage[] }>(
            `/studynotes/${id}/follow-up`,
            options,
        )
    },
    getMessages: (id: number) => {
        assertValidId(id)
        return request<StudynotesMessage[]>(`/studynotes/${id}/messages`)
    },
}
