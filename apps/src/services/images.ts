'use client'

import { request } from './request'

export const imagesApi = {
    list: () => request<string[]>('/images'),
}
