'use client'

import { request } from './request'
import type {
    AiScoreLog,
    AIScoreResult,
    CreateTaskRequest,
    Submission,
    SubmitTaskRequest,
    Task,
    TaskConversation,
    TaskMessage,
    UpdateTaskRequest,
} from '@shared/types'

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
    aiScoreLogs: (id: number) =>
        request<AiScoreLog[]>(`/tasks/${id}/ai-score-logs`),
    aiTitle: (id: number) =>
        request<{ title: string }>(`/tasks/${id}/ai-title`, { method: 'POST' }),
    aiGenerateTitle: (type: string, grade: number) =>
        request<{ title: string }>('/tasks/ai-generate-title', {
            method: 'POST',
            body: JSON.stringify({ type, grade }),
        }),
    aiDemo: (id: number) =>
        request<{ demo: string }>(`/tasks/${id}/ai-demo`, { method: 'POST' }),
    aiChat: (id: number, message: string) =>
        request<{ reply: string }>(`/tasks/${id}/ai-chat`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        }),
    getConversation: (id: number) =>
        request<{
            conversation: TaskConversation | null
            messages: TaskMessage[]
        }>(`/tasks/${id}/conversation`),
}
