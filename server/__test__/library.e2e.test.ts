import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, initRequest } from './helpers'
import { pushSchema, seedOptions } from './test-db'

/** 1×1 透明 PNG，仅用于校验图片字节的往返一致性 */
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
)

const MD_CONTENT = [
    '---',
    'title: 分数练习题',
    'full_score: 100',
    '---',
    '',
    '# 分数练习题',
    '',
    '（10 分）计算 1/2 + 1/3。',
].join('\n')

let libraryRoot = ''

describe('全链路：本地题库（Markdown 与图片）', () => {
    beforeAll(async () => {
        await initRequest()
        await pushSchema()
        // 用临时目录充当题库根目录，避免依赖仓库内 library/ 的实际内容
        libraryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-e2e-'))
        fs.mkdirSync(path.join(libraryRoot, 'img'))
        fs.writeFileSync(
            path.join(libraryRoot, '01-分数练习题.md'),
            MD_CONTENT,
            'utf8',
        )
        fs.writeFileSync(path.join(libraryRoot, 'img', 'sample.png'), PNG_BYTES)
        // 不在白名单内的 SVG：整份目录扫描与内容接口都应拒绝
        fs.writeFileSync(
            path.join(libraryRoot, 'logo.svg'),
            '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            'utf8',
        )
        await seedOptions({ system: { libraryDirectory: libraryRoot } })
    })

    afterAll(() => {
        fs.rmSync(libraryRoot, { recursive: true, force: true })
    })

    it('清单收录 .md 与白名单图片，并标注各自类型', async () => {
        const res = await api().get('/api/library')
        expect(res.status).toBe(200)
        expect(res.body.exists).toBe(true)
        const files: Array<{
            path: string
            kind: string
            title: string
            fullScore: number | null
        }> = res.body.files
        expect(files.map((file) => file.path).sort()).toEqual([
            '01-分数练习题.md',
            'img/sample.png',
        ])
        const markdown = files.find((file) => file.path === '01-分数练习题.md')
        expect(markdown?.kind).toBe('markdown')
        expect(markdown?.title).toBe('分数练习题')
        expect(markdown?.fullScore).toBe(100)
        const image = files.find((file) => file.path === 'img/sample.png')
        expect(image?.kind).toBe('image')
        expect(image?.title).toBe('sample')
        expect(image?.fullScore).toBeNull()
    })

    it('图片内容以 data URL 返回，且解码后与原始字节一致', async () => {
        const res = await api()
            .get('/api/library/content')
            .query({ path: 'img/sample.png' })
        expect(res.status).toBe(200)
        expect(res.body.kind).toBe('image')
        expect(res.body.fullScore).toBeNull()
        const prefix = 'data:image/png;base64,'
        const content: string = res.body.content
        expect(content.startsWith(prefix)).toBe(true)
        const decoded = Buffer.from(content.slice(prefix.length), 'base64')
        expect(decoded.equals(PNG_BYTES)).toBe(true)
    })

    it('Markdown 内容保持原文，并解析 front-matter 满分', async () => {
        const res = await api()
            .get('/api/library/content')
            .query({ path: '01-分数练习题.md' })
        expect(res.status).toBe(200)
        expect(res.body.kind).toBe('markdown')
        expect(res.body.content).toBe(MD_CONTENT)
        expect(res.body.fullScore).toBe(100)
    })

    it('删除文档后文件消失且不再出现在清单中', async () => {
        const target = path.join(libraryRoot, '02-待删除题目.md')
        fs.writeFileSync(target, '# 待删除题目\n\n1. 题干。', 'utf8')
        const removed = await api()
            .delete('/api/library/file')
            .query({ path: '02-待删除题目.md' })
        expect(removed.status).toBe(200)
        expect(removed.body.deleted).toBe(true)
        expect(fs.existsSync(target)).toBe(false)
        const list = await api().get('/api/library')
        expect(
            list.body.files.some(
                (file: { path: string }) => file.path === '02-待删除题目.md',
            ),
        ).toBe(false)
    })

    it('删除不存在的文件返回 404，越界/非白名单返回 403，缺参数返回 400', async () => {
        const missing = await api()
            .delete('/api/library/file')
            .query({ path: 'not-exists.md' })
        expect(missing.status).toBe(404)
        const escape = await api()
            .delete('/api/library/file')
            .query({ path: '../secret.md' })
        expect(escape.status).toBe(403)
        const svg = await api()
            .delete('/api/library/file')
            .query({ path: 'logo.svg' })
        expect(svg.status).toBe(403)
        expect(fs.existsSync(path.join(libraryRoot, 'logo.svg'))).toBe(true)
        const empty = await api().delete('/api/library/file')
        expect(empty.status).toBe(400)
    })

    it('非白名单扩展名与越界路径一律拒绝', async () => {
        const svg = await api()
            .get('/api/library/content')
            .query({ path: 'logo.svg' })
        expect(svg.status).toBe(403)
        const escape = await api()
            .get('/api/library/content')
            .query({ path: '../secret.md' })
        expect(escape.status).toBe(403)
        const absolute = await api()
            .get('/api/library/content')
            .query({ path: path.join(libraryRoot, '01-分数练习题.md') })
        expect(absolute.status).toBe(403)
    })
})
