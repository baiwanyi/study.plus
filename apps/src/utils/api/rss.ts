'use client'

import { request } from './request'

function assertValidId(id: number): void {
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`无效的 RSS 文章 ID: ${id}`)
    }
}

export interface RssFeedItem {
    id: number
    title: string
    link: string
    pubDate: string
    excerpt: string
    image?: string
}

export interface RssPostDetail {
    id: number
    title: string
    content: string
    date: string
    excerpt: string
}

export const rssApi = {
    list: (cat?: number) => {
        const qs = cat != null && Number.isInteger(cat) && cat > 0
            ? `?cat=${cat}`
            : ''
        return request<{ items: RssFeedItem[] }>(`/rss/feed${qs}`)
    },
    getPost: (id: number) => {
        assertValidId(id)
        return request<RssPostDetail>(`/rss/post/${id}`)
    },
}
