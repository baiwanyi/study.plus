'use client'

import { request } from './request'
import type { FeynmanCard, FeynmanCreateRequest, FeynmanEvaluation, FeynmanMessage } from '@shared/types'

function assertValidId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`无效的心得卡 ID: ${id}`)
    }
}

export const feynmanApi = {
    list: (params?: Record<string, string>) => {
        const qs = params && Object.keys(params).length > 0
            ? '?' + new URLSearchParams(params).toString()
            : ''
        return request<FeynmanCard[]>(`/feynman${qs}`)
    },
    get: (id: number) => {
        assertValidId(id)
        return request<FeynmanCard>(`/feynman/${id}`)
    },
    create: (data: FeynmanCreateRequest) =>
        request<FeynmanCard>('/feynman', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    update: (id: number, data: Partial<FeynmanCreateRequest> & { memoryHook?: string | null }) => {
        assertValidId(id)
        return request<FeynmanCard>(`/feynman/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        })
    },
    delete: (id: number) => {
        assertValidId(id)
        return request<{ success: boolean }>(`/feynman/${id}`, { method: 'DELETE' })
    },
    evaluate: (id: number) => {
        assertValidId(id)
        return request<{ evaluation: FeynmanEvaluation; evaluatedAt: string }>(
            `/feynman/${id}/evaluate`,
            { method: 'POST' },
        )
    },
    followUp: (id: number, message?: string) => {
        assertValidId(id)
        const options: RequestInit = { method: 'POST' }
        if (message) {
            options.body = JSON.stringify({ message })
        }
        return request<{ messages: FeynmanMessage[] }>(
            `/feynman/${id}/follow-up`,
            options,
        )
    },
    getMessages: (id: number) => {
        assertValidId(id)
        return request<FeynmanMessage[]>(`/feynman/${id}/messages`)
    },
}
