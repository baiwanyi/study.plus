'use client'

import { BASE, request } from './request'
import type { ScanResult, Video } from '@shared/types'

export const videosApi = {
    list: (limit?: number, favorite?: number) => {
        const params = new URLSearchParams()
        if (limit != null && limit > 0) { params.set('limit', String(limit)) }
        if (favorite === 1) params.set('favorite', '1')
        const qs = params.toString()
        return request<Video[]>(`/videos${qs ? `?${qs}` : ''}`)
    },
    listFavorites: () => request<Video[]>('/videos?favorite=1'),
    get: (md5: string) => request<Video>(`/videos/${encodeURIComponent(md5)}`),
    scan: (signal?: AbortSignal) =>
        request<ScanResult>('/videos/scan', { method: 'POST', signal }),
    scanWithProgress: async (
        onProgress: (current: number, total: number) => void,
        signal?: AbortSignal,
    ): Promise<ScanResult> => {
        const res = await fetch(`${BASE}/videos/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal,
        })
        if (!res.ok) {
            const err = await res
                .json()
                .catch(() => ({ error: res.statusText }))
            throw new Error(err.error || `扫描失败: ${res.status}`)
        }
        if (!res.body) {
            throw new Error('扫描响应缺少响应体')
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let aborted = false
        let resolved = false

        if (signal) {
            signal.addEventListener('abort', () => {
                aborted = true
                reader.cancel()
            }, { once: true })
        }

        function tryParseStreamLine(
            line: string,
            resolve: (value: ScanResult) => void,
            reject: (reason: unknown) => void,
            onProgress: (current: number, total: number) => void,
        ): void {
            if (resolved) return
            let data: Record<string, unknown>
            try {
                data = JSON.parse(line)
            } catch {
                console.warn('[videosApi] 忽略异常的流数据行:', line)
                return
            }
            if (data.type === 'progress') {
                const current = Number(data.current)
                const total = Number(data.total)
                if (Number.isFinite(current) && Number.isFinite(total)
                    && current >= 0 && total >= 0) {
                    onProgress(current, total)
                } else {
                    console.warn('[videosApi] 忽略无效进度数据:', data)
                }
            } else if (data.type === 'complete') {
                resolved = true
                const toNum = (v: unknown): number => {
                    const n = Number(v)
                    return Number.isFinite(n) ? n : 0
                }
                resolve({
                    total: toNum(data.total),
                    new: toNum(data.new),
                    skipped: toNum(data.skipped),
                    deleted: toNum(data.deleted),
                    errors: Array.isArray(data.errors) ? data.errors : [],
                })
            } else if (data.type === 'error') {
                reject(new Error(String(data.message ?? '未知扫描错误')))
            }
        }

        return new Promise<ScanResult>((resolve, reject) => {
            const pump = () => {
                if (aborted) {
                    reject(new DOMException('扫描已取消', 'AbortError'))
                    return
                }
                if (resolved) return
                reader
                    .read()
                    .then(({ done, value }) => {
                        if (done) {
                            if (aborted) {
                                reject(new DOMException('扫描已取消', 'AbortError'))
                                return
                            }
                            /* 最后一块可能没有换行符结尾，complete 残留 buffer 中 */
                            if (buffer.trim()) {
                                tryParseStreamLine(buffer, resolve, reject, onProgress)
                            }
                            if (!resolved) {
                                reject(new Error('流意外结束，未收到完成信号'))
                            }
                            return
                        }
                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || ''
                        for (const line of lines) {
                            if (!line.trim()) continue
                            tryParseStreamLine(line, resolve, reject, onProgress)
                        }
                        pump()
                    })
                    .catch((err) => {
                        if (aborted) return
                        reject(err)
                    })
            }
            pump()
        }).finally(() => {
            reader.releaseLock()
        })
    },
    updateTitle: (md5: string, title: string) =>
        request<Video>(`/videos/${encodeURIComponent(md5)}`, {
            method: 'PUT',
            body: JSON.stringify({ title }),
        }),
    addView: (md5: string) =>
        request<{ success: boolean }>(`/videos/${encodeURIComponent(md5)}/view`, {
            method: 'POST',
        }),
    saveResumeTime: (md5: string, time: number) =>
        request<{ success: boolean }>(`/videos/${encodeURIComponent(md5)}/resume-time`, {
            method: 'PUT',
            body: JSON.stringify({ time }),
        }),
    toggleFavorite: (md5: string) =>
        request<Video>(`/videos/${encodeURIComponent(md5)}/toggle-favorite`, { method: 'POST' }),
    streamUrl: (md5: string) => `${BASE}/videos/stream/${encodeURIComponent(md5)}`,
}
