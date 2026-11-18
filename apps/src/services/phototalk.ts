/**
 * 看图说话前端服务层：对接 /api/phototalk 的搜索、采集、详情、评分与历史接口。
 * 复用约定：统一经 request 携带 X-API-Key 并处理错误，类型直接引用 @shared/types，
 * 与服务端 DTO 共用同一份契约；搜索参数中的中文字段由 URLSearchParams 负责编码。
 * 关键约束：只向服务端提交图片 ID 与描述文本，不接收也不保存 Unsplash Access Key；
 * 图片详情中的 imageDataUrl 为服务端读取本地文件后的 data URL，可直接交给 <img> 渲染。
 */
'use client'

import type {
    PictureDetail,
    PictureImageListItem,
    PictureImageRecord,
    PictureScoreResult,
    PictureSearchItem,
    PictureSubmissionRecord,
} from '@shared/types'
import { request } from './request'

export interface PictureScoreResponse {
    submission: PictureSubmissionRecord
    aiResult: PictureScoreResult
}

export const phototalkApi = {
    /** 搜索候选图片，结果仅含展示字段 */
    search(query: string, page = 1, perPage = 12): Promise<PictureSearchItem[]> {
        const params = new URLSearchParams({
            query,
            page: String(page),
            per_page: String(perPage),
        })
        return request<PictureSearchItem[]>(`/phototalk/search?${params.toString()}`)
    },

    /** 保存选中图片，服务端按 ID 幂等落盘 */
    save(unsplashId: string): Promise<PictureImageRecord> {
        return request<PictureImageRecord>('/phototalk/images', {
            method: 'POST',
            body: JSON.stringify({ unsplashId }),
        })
    },

    /** 已采集图片清单：含描述状态与最近评分 */
    list(): Promise<PictureImageListItem[]> {
        return request<PictureImageListItem[]>('/phototalk/images')
    },

    /** 单图详情：包含可直接渲染的 data URL 与关键词提示 */
    detail(id: number): Promise<PictureDetail> {
        return request<PictureDetail>(`/phototalk/images/${id}`)
    },

    /** 保存描述草稿：手动保存与防抖自动保存共用 */
    saveDraft(imageId: number, content: string): Promise<{ saved: boolean }> {
        return request<{ saved: boolean }>(`/phototalk/images/${imageId}/draft`, {
            method: 'PUT',
            body: JSON.stringify({ content }),
        })
    },

    /** 提交描述并获取 AI 评分 */
    score(imageId: number, content: string): Promise<PictureScoreResponse> {
        return request<PictureScoreResponse>('/phototalk/score', {
            method: 'POST',
            body: JSON.stringify({ imageId, content }),
        })
    },

    /** 练习历史，可按图片过滤 */
    history(imageId?: number): Promise<PictureSubmissionRecord[]> {
        const suffix = imageId === undefined ? '' : `?imageId=${imageId}`
        return request<PictureSubmissionRecord[]>(`/phototalk/submissions${suffix}`)
    },
}
