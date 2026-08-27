'use client'

import {
    defaultCustomRemark,
    defaultExamRemark,
    defaultQuotes,
    defaultSubmissionRemark,
} from '@shared/constants'
import { request } from './request'

function assertValidKey(key: string): void {
    if (typeof key !== 'string' || key.trim() === '') {
        throw new Error(`无效的选项键: ${key}`)
    }
}

export const optionsAPI = {
    get: (key: string) => {
        assertValidKey(key)
        return request<unknown>(`/options/${key}`)
    },
    update: (key: string, value: unknown) => {
        assertValidKey(key)
        return request<{ success: boolean }>(`/options/${key}`, {
            method: 'PUT',
            body: JSON.stringify(value),
        })
    },
}

interface RemarkOptions {
    exam: string
    submission: string
    custom: string
}

const defaultRemark: RemarkOptions = {
    exam: defaultExamRemark.join('\n'),
    submission: defaultSubmissionRemark.join('\n'),
    custom: defaultCustomRemark.join('\n'),
}

export const remarkApi = {
    get: async (): Promise<RemarkOptions> => {
        try {
            const data = await optionsAPI.get('remark')
            if (data && typeof data === 'object') {
                const option = data as Record<string, unknown>
                return {
                    exam: typeof option.exam === 'string' ? option.exam : defaultRemark.exam,
                    submission: typeof option.submission === 'string'
                        ? option.submission
                        : defaultRemark.submission,
                    custom: typeof option.custom === 'string' ? option.custom : defaultRemark.custom,
                }
            }
        } catch {}
        return defaultRemark
    },
    update: async (options: RemarkOptions) => {
        await optionsAPI.update('remark', options)
    },
}

export const quotesApi = {
    get: async (): Promise<string[]> => {
        try {
            const data = await optionsAPI.get('quotes')
            if (Array.isArray(data)) {
                return data.filter((q): q is string => typeof q === 'string')
            }
            if (data && typeof data === 'object' && 'quotes' in data) {
                const option = data as { quotes: unknown }
                if (Array.isArray(option.quotes)) {
                    return option.quotes.filter((q): q is string => typeof q === 'string')
                }
            }
        } catch {}
        return defaultQuotes
    },
    update: async (quotes: string[]) => {
        await optionsAPI.update('quotes', quotes)
    },
}
