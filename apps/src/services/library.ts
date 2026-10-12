/**
 * 本地题库服务层：对接 /api/library 的清单与内容读取接口。
 * 复用 request 统一携带鉴权头与错误处理，路径在客户端先做基础形态校验后再传输。
 * 关键约束：path 必须是相对题库根目录的 .md 或白名单图片路径，禁止绝对路径与 `..` 段，
 * 服务端仍会二次校验（防目录遍历），此处校验仅用于尽早拦截明显非法入参；
 * 图片的 content 为 data URL，交给 <img> 直接渲染，不走 Markdown。
 */
'use client'

import { request } from './request'

/** 文件类型：Markdown 走渲染管线，图片直出原图 */
export type LibraryFileKind = 'markdown' | 'image'

export interface LibraryFileMeta {
    path: string
    name: string
    kind: LibraryFileKind
    title: string
    fullScore: number | null
    size: number
    mtime: string
}

export interface LibraryFileDetail {
    path: string
    kind: LibraryFileKind
    title: string
    /** Markdown 原文；kind 为 image 时是可直接用于 <img> 的 data URL */
    content: string
    fullScore: number | null
    mtime: string
}

export interface LibraryListResult {
    dir: string
    exists: boolean
    files: LibraryFileMeta[]
}

/** 图片扩展名白名单：与服务端保持一致，仅用于尽早拦截非法入参 */
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|bmp)$/i

function assertValidPath(relPath: string): void {
    const invalid =
        !relPath ||
        relPath.length > 512 ||
        relPath.includes('\0') ||
        relPath.split(/[\\/]+/).includes('..') ||
        (!/\.md$/i.test(relPath) && !IMAGE_EXTENSION.test(relPath))
    if (invalid) {
        throw new Error(`无效的题目文件路径: ${relPath}`)
    }
}

export const libraryApi = {
    list: () => request<LibraryListResult>('/library'),
    content: (relPath: string) => {
        assertValidPath(relPath)
        return request<LibraryFileDetail>(
            `/library/content?path=${encodeURIComponent(relPath)}`,
        )
    },
}
