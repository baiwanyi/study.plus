'use client'

import { request } from './request'
import type {
    StudynotesItem,
    StudynotesCreateRequest,
    StudynotesEvaluation,
    StudynotesQuiz,
} from '@shared/types'

function assertPositiveInt(value: number, field: string): void {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`无效的${field}: ${value}`)
    }
}

function assertStringArray(value: unknown, field: string): void {
    if (
        !Array.isArray(value) ||
        !value.every((item) => typeof item === 'string')
    ) {
        throw new Error(`${field} 必须为字符串数组`)
    }
}

export const studynotesApi = {
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
        return request<StudynotesItem[]>(`/studynotes${qs}`)
    },
    get: (id: number) => {
        assertPositiveInt(id, '学习心得 ID')
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
        assertPositiveInt(id, '学习心得 ID')
        return request<StudynotesItem>(`/studynotes/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertPositiveInt(id, '学习心得 ID')
        return request<{ success: boolean }>(`/studynotes/${id}`, {
            method: 'DELETE',
        })
    },
    evaluate: (id: number) => {
        assertPositiveInt(id, '学习心得 ID')
        return request<{
            evaluation: StudynotesEvaluation
            evaluatedAt: string
        }>(`/studynotes/${id}/evaluate`, { method: 'POST' })
    },
    generateQuiz: (id: number) => {
        assertPositiveInt(id, '学习心得 ID')
        return request<{ quiz: StudynotesQuiz }>(`/studynotes/${id}/quiz`, {
            method: 'POST',
        })
    },
    getLatestQuiz: (id: number) => {
        assertPositiveInt(id, '学习心得 ID')
        return request<{ quiz: StudynotesQuiz | null }>(
            `/studynotes/${id}/quiz/latest`,
        )
    },
    saveQuizAnswers: (id: number, quizId: number, answers: string[]) => {
        assertPositiveInt(id, '学习心得 ID')
        assertPositiveInt(quizId, '测验 ID')
        assertStringArray(answers, '答案')
        return request<{ success: boolean }>(
            `/studynotes/${id}/quiz/${quizId}/answers`,
            {
                method: 'PATCH',
                body: JSON.stringify({ answers }),
            },
        )
    },
    submitQuiz: (id: number, quizId: number, answers: string[]) => {
        assertPositiveInt(id, '学习心得 ID')
        assertPositiveInt(quizId, '测验 ID')
        assertStringArray(answers, '答案')
        return request<{ quiz: StudynotesQuiz }>(
            `/studynotes/${id}/quiz/${quizId}/submit`,
            {
                method: 'POST',
                body: JSON.stringify({ answers }),
            },
        )
    },
    gradeQuiz: (id: number, quizId: number) => {
        assertPositiveInt(id, '学习心得 ID')
        assertPositiveInt(quizId, '测验 ID')
        return request<{ quiz: StudynotesQuiz }>(
            `/studynotes/${id}/quiz/${quizId}/grade`,
            { method: 'POST' },
        )
    },
}
