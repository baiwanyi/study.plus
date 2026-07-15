'use client'

export const BASE = '/api'

export async function request<T>(url: string, options?: RequestInit): Promise<T> {
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
        const message = typeof err.error === 'string'
            ? err.error
            : err.error != null
                ? JSON.stringify(err.error)
                : `请求失败: ${res.status}`
        throw new Error(message)
    }
    const text = await res.text()
    if (!text) {
        return undefined as T
    }
    return JSON.parse(text) as T
}
