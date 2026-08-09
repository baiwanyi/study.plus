'use client'

import { request } from './request'
import type {
    StudynotesItem,
    StudynotesCreateRequest,
    StudynotesEvaluation,
    StudynotesQuiz,
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
        return request<StudynotesItem[]>(`/studynotes${qs}`)
    },
    get: (id: number) => {
        assertValidId(id)
        return request<StudynotesItem>(`/studynotes/${id}`)
    },
    create: (data: StudynotesCreateRequest) =>
        request<StudynotesItem>('/studynotes', {
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
        return request<StudynotesItem>(`/studynotes/${id}`, {
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
    generateQuiz: (id: number) => {
        assertValidId(id)
        return request<{ quiz: StudynotesQuiz }>(`/studynotes/${id}/quiz`, {
            method: 'POST',
        })
    },
    getLatestQuiz: (id: number) => {
        assertValidId(id)
        return request<{ quiz: StudynotesQuiz | null }>(
            `/studynotes/${id}/quiz/latest`,
        )
    },
    saveQuizAnswers: (id: number, quizId: number, answers: string[]) => {
        assertValidId(id)
        if (!Number.isInteger(quizId) || quizId <= 0) {
            throw new Error(`无效测验 ID: ${quizId}`)
        }
        return request<{ success: boolean }>(
            `/studynotes/${id}/quiz/${quizId}/answers`,
            {
                method: 'PATCH',
                body: JSON.stringify({ answers }),
            },
        )
    },
    submitQuiz: (id: number, quizId: number, answers: string[]) => {
        assertValidId(id)
        if (!Number.isInteger(quizId) || quizId <= 0) {
            throw new Error(`无效测验 ID: ${quizId}`)
        }
        return request<{ quiz: StudynotesQuiz }>(
            `/studynotes/${id}/quiz/${quizId}/submit`,
            {
                method: 'POST',
                body: JSON.stringify({ answers }),
            },
        )
    },
}
