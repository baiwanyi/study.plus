'use client'

import { request } from './request'
import type { AIUsageLog, AIUsageSummary } from '@shared/types'

export const aiUsageApi = {
    list: () => request<AIUsageLog[]>('/ai-usage'),
    summary: () => request<AIUsageSummary[]>('/ai-usage/summary'),
}
