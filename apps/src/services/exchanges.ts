'use client'

import { request } from './request'
import type { CreateExchangeRequest, Exchange } from '@shared/types'

function assertValidId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`无效的兑换记录 ID: ${id}`)
    }
}

export const exchangesApi = {
    list: (params?: Record<string, string>) => {
        const qs = params && Object.keys(params).length > 0
            ? '?' + new URLSearchParams(params).toString()
            : ''
        return request<Exchange[]>(`/exchanges${qs}`)
    },
    create: (data: CreateExchangeRequest) =>
        request<Exchange>('/exchanges', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
    revoke: (id: number) => {
        assertValidId(id)
        return request<Exchange>(`/exchanges/${id}/revoke`, { method: 'POST' })
    },
}
