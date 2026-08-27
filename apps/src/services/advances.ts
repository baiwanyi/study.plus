'use client'

import { request } from './request'
import type { AdvanceSummary, CreateAdvanceRequest, PointAdvance } from '@shared/types'

export const advancesApi = {
    list: () => request<PointAdvance[]>('/points/advances'),
    summary: () => request<AdvanceSummary>('/points/advances/summary'),
    create: (data: CreateAdvanceRequest) =>
        request<PointAdvance>('/points/advances', {
            method: 'POST',
            body: JSON.stringify(data),
        }),
}
