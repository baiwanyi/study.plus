/**
 * Unsplash 图片采集服务：按关键词搜索候选、按图片 ID 取回原图并固定长边 1600px 落盘。
 * 复用约定：AccessToken 仅从服务端环境变量读取，目录基准与数据库路径同源于 paths/db 模块，
 * 文件名即 Unsplash 图片 ID，重复采集复用已落盘文件；搜索结果只映射展示所需的白名单字段。
 * 关键约束：只接受图片 ID 入参，下载目标必须来自 Unsplash 官方响应且域名为 images.unsplash.com，
 * 禁止接收前端传入的任意 URL；ID 白名单校验防目录穿越，下载校验类型与体积防恶意内容写入。
 */
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import type { PictureSearchItem } from '@shared/types'
import { DB_FILE_PATH } from '../db/index'
import { resolveDataDir } from '../paths'

const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY
const API_BASE = 'https://api.unsplash.com'
const IMAGE_HOST = 'images.unsplash.com'
const MAX_EDGE = 1600
const THUMBNAIL_EDGE = 400
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024
const DOWNLOAD_TIMEOUT_MS = 15_000
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** 未配置 Access Key 时由路由转成 503，不设默认回退值 */
export class UnsplashUnavailableError extends Error {
    constructor() {
        super('Unsplash 服务未配置：请联系管理员设置 UNSPLASH_ACCESS_KEY')
        this.name = 'UnsplashUnavailableError'
    }
}

const photoSchema = z.object({
    id: z.string().min(1),
    width: z.number().int().positive().default(MAX_EDGE),
    height: z.number().int().positive().default(MAX_EDGE),
    alt_description: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    urls: z.object({
        raw: z.string().url(),
        small: z.string().url().optional(),
    }),
    user: z.object({ name: z.string().default('') }).default({ name: '' }),
})

const searchResponseSchema = z.object({
    results: z.array(photoSchema).default([]),
})

function requireAccessKey(): string {
    if (!UNSPLASH_ACCESS_KEY) {
        throw new UnsplashUnavailableError()
    }
    return UNSPLASH_ACCESS_KEY
}

/** 只允许 Unsplash 官方图片域名，杜绝借搜索响应跳转到内网地址 */
function isAllowedImageUrl(raw: string): boolean {
    try {
        const url = new URL(raw)
        return url.protocol === 'https:' && url.hostname === IMAGE_HOST
    } catch {
        return false
    }
}

/** 在官方 URL 上叠加 imgix 尺寸参数，fit=max 表示框内等比缩放（长边不超过 1600，不裁剪） */
function buildSizedImageUrl(raw: string, edge: number): string {
    if (!isAllowedImageUrl(raw)) {
        throw new Error('Unsplash 返回了不受信任的图片地址')
    }
    const url = new URL(raw)
    url.searchParams.set('w', String(edge))
    if (edge === MAX_EDGE) {
        url.searchParams.set('h', String(MAX_EDGE))
        url.searchParams.set('fit', 'max')
    }
    url.searchParams.set('q', '80')
    url.searchParams.set('fm', 'jpg')
    return url.toString()
}

/** 未显式配置目录时，与 library/ 一样随数据库目录迁移，落在其兄弟目录 unsplash/ */
function resolveUnsplashRoot(): string {
    const dataFile = DB_FILE_PATH ?? path.join(resolveDataDir(), 'study.db')
    return path.join(path.dirname(path.dirname(dataFile)), 'unsplash')
}

export interface SavedPicture {
    filePath: string
    width: number
    height: number
    sourceDescription: string | null
    thumbnailUrl: string | null
    imageBuffer: Buffer
}

/** 搜索候选：只返回 id、缩略图、作者与描述，AccessToken 与原始响应均不下发 */
export async function searchPhotos(
    query: string,
    page: number,
    perPage: number,
): Promise<PictureSearchItem[]> {
    const accessKey = requireAccessKey()
    const url = new URL(`${API_BASE}/search/photos`)
    url.searchParams.set('query', query)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(perPage))
    // 只看横版候选，避免竖图进入看图说话流程后需要裁切才能填满卡片
    url.searchParams.set('orientation', 'landscape')

    const response = await fetch(url, {
        headers: {
            Authorization: `Client-ID ${accessKey}`,
            Accept: 'application/json',
        },
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    })
    if (!response.ok) {
        throw new Error(`Unsplash 搜索失败（HTTP ${response.status}）`)
    }

    const parsed = searchResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
        throw new Error('Unsplash 搜索响应结构异常')
    }

    return parsed.data.results.flatMap((photo) => {
        const thumbnailUrl = buildSizedImageUrl(
            photo.urls.small ?? photo.urls.raw,
            THUMBNAIL_EDGE,
        )
        if (!isAllowedImageUrl(thumbnailUrl)) return []
        return [{
            id: photo.id,
            thumbnailUrl,
            author: photo.user.name || '未知作者',
            description: photo.alt_description ?? photo.description ?? '',
        }]
    })
}

/** 按 ID 获取图片详情并落盘：返回缓冲区供关键词生成复用，避免二次读盘 */
export async function fetchAndSavePhoto(id: string): Promise<SavedPicture> {
    if (!ID_PATTERN.test(id)) {
        throw new Error('图片 ID 格式不合法')
    }
    const accessKey = requireAccessKey()

    const detailResponse = await fetch(
        `${API_BASE}/photos/${encodeURIComponent(id)}`,
        {
            headers: {
                Authorization: `Client-ID ${accessKey}`,
                Accept: 'application/json',
            },
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        },
    )
    if (!detailResponse.ok) {
        if (detailResponse.status === 401) {
            throw new Error('Unsplash Access Key 无效，请检查服务端配置')
        }
        if (detailResponse.status === 404) {
            throw new Error('未找到该图片，请重新搜索')
        }
        throw new Error(`获取图片详情失败（HTTP ${detailResponse.status}）`)
    }

    const parsed = photoSchema.safeParse(await detailResponse.json())
    if (!parsed.success) {
        throw new Error('Unsplash 图片详情响应结构异常')
    }
    const photo = parsed.data

    const imageResponse = await fetch(
        buildSizedImageUrl(photo.urls.raw, MAX_EDGE),
        {
            signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        },
    )
    if (!imageResponse.ok) {
        throw new Error(`图片下载失败（HTTP ${imageResponse.status}）`)
    }

    const mimeType = imageResponse.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase()
    if (!mimeType || !ALLOWED_MIME.has(mimeType)) {
        throw new Error('下载内容不是受支持的图片格式')
    }
    const declaredSize = Number(imageResponse.headers.get('content-length') ?? 0)
    if (declaredSize > MAX_DOWNLOAD_BYTES) {
        throw new Error('图片体积超过 5MB 上限')
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())
    if (imageBuffer.length === 0 || imageBuffer.length > MAX_DOWNLOAD_BYTES) {
        throw new Error('图片内容为空或超过 5MB 上限')
    }

    const rootDir = resolveUnsplashRoot()
    await fs.promises.mkdir(rootDir, { recursive: true })
    const filePath = path.join(rootDir, `${id}.jpg`)
    await fs.promises.writeFile(filePath, imageBuffer)

    const scale = Math.min(1, MAX_EDGE / Math.max(photo.width, photo.height))
    const thumbnailSource = photo.urls.small ?? photo.urls.raw
    const thumbnailUrl = isAllowedImageUrl(thumbnailSource)
        ? buildSizedImageUrl(thumbnailSource, THUMBNAIL_EDGE)
        : null
    return {
        filePath,
        width: Math.max(1, Math.round(photo.width * scale)),
        height: Math.max(1, Math.round(photo.height * scale)),
        sourceDescription: photo.alt_description ?? photo.description,
        thumbnailUrl,
        imageBuffer,
    }
}

/** 从本地目录读出图片并编码为 data URL；仅接受本模块生成的 <ID>.jpg 文件名 */
export async function readLocalImageAsDataUrl(filePath: string): Promise<string> {
    const fileName = path.basename(filePath)
    const id = fileName.replace(/\.jpg$/i, '')
    if (!/\.jpg$/i.test(fileName) || !ID_PATTERN.test(id)) {
        throw new Error('图片文件路径不合法')
    }
    const fullPath = path.join(resolveUnsplashRoot(), fileName)
    const buffer = await fs.promises.readFile(fullPath)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
}

/** 已落盘图片直接复用，返回其绝对路径与标称尺寸供数据库 upsert */
export function resolveExistingPhoto(id: string): SavedPicture | null {
    if (!ID_PATTERN.test(id)) {
        throw new Error('图片 ID 格式不合法')
    }
    const filePath = path.join(resolveUnsplashRoot(), `${id}.jpg`)
    if (!fs.existsSync(filePath)) return null
    return {
        filePath,
        width: MAX_EDGE,
        height: MAX_EDGE,
        sourceDescription: null,
        thumbnailUrl: null,
        imageBuffer: Buffer.alloc(0),
    }
}
