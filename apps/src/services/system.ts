'use client'

import { request } from './request'

interface AppConfig {
    autosaveInterval: number
    pageSize: number
}

export const systemAPI = {
    get: () => request<AppConfig>('/system'),
}
