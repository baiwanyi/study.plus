/**
 * 本地题库服务层：对接 /api/library 的清单、内容读取、AI 解题思路与 AI 出卷接口。
 * 复用 request 统一携带鉴权头与错误处理，路径在客户端先做基础形态校验后再传输。
 * 关键约束：path 必须是相对题库根目录的 .md 或白名单图片路径，禁止绝对路径与 `..` 段，
 * 服务端仍会二次校验（防目录遍历），此处校验仅用于尽早拦截明显非法入参；
 * 图片的 content 为 data URL，交给 <img> 直接渲染，不走 Markdown；
 * 解题思路接口只提交「路径 + 小题索引」，题干由服务端自行读取，前端不得提交任意题干文本；
 * 出卷接口只付出卷参数，文件命名与落盘由服务端负责，返回的 path 用于定位新文件。
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

export interface LibraryHintResult {
    /** 解题思路 Markdown 正文（只含方法与引导问题，不含答案） */
    hint: string
    /** 是否为题目文件中已保存的思路（未重新调用 AI） */
    cached: boolean
    /** 本次结果是否已写入题目文件；为 false 时仍可查看，仅表示未持久化 */
    saved: boolean
}

/** AI 出卷入参：标题由服务端按生成内容自拟，此处只提交范围与要求 */
export interface LibraryGenerateInput {
    grade: string
    subject: string
    /** 题目要求（文字），可为空；仅传图片时也可只提交图片 */
    requirements: string
    questionCount: number
    /** 题目要求附带的参考图片（data URL），最多 9 张；随消息以多模态分片发送 */
    images?: string[]
}

export interface LibraryGenerateResult {
    /** 新文件相对题库根目录的路径 */
    path: string
    title: string
    content: string
}

export interface LibraryDeleteResult {
    deleted: boolean
    /** 被删除文件的题库相对路径 */
    path: string
}

export const libraryApi = {
    list: () => request<LibraryListResult>('/library'),
    content: (relPath: string) => {
        assertValidPath(relPath)
        return request<LibraryFileDetail>(
            `/library/content?path=${encodeURIComponent(relPath)}`,
        )
    },
    /**
     * 取某道小题的解题思路；isRegenerate 为真时要求换一种切入角度（服务端不缓存该结果）。
     * signal 由调用方传入以支持切题时取消；同时叠加 120s 上限，避免服务端异常时前端一直转圈。
     */
    hint: (
        relPath: string,
        questionIndex: number,
        isRegenerate = false,
        signal?: AbortSignal,
    ) => {
        assertValidPath(relPath)
        const timeout = AbortSignal.timeout(120_000)
        return request<LibraryHintResult>('/library/hint', {
            method: 'POST',
            body: JSON.stringify({
                path: relPath,
                questionIndex,
                regenerate: isRegenerate,
            }),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
    },
    /**
     * AI 出卷并保存到题库目录；signal 由调用方传入以支持取消。
     * 整卷生成耗时可达 1~2 分钟（含缺答案时的补写），超时上限放宽到 180s。
     */
    generate: (input: LibraryGenerateInput, signal?: AbortSignal) => {
        const timeout = AbortSignal.timeout(180_000)
        return request<LibraryGenerateResult>('/library/generate', {
            method: 'POST',
            body: JSON.stringify(input),
            signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        })
    },
    /** 删除题库文件（不可恢复）；路径校验与服务端一致，服务端仍会二次校验越界 */
    remove: (relPath: string) => {
        assertValidPath(relPath)
        return request<LibraryDeleteResult>(
            `/library/file?path=${encodeURIComponent(relPath)}`,
            { method: 'DELETE' },
        )
    },
}
