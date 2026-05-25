import { Router, type Request, type Response } from 'express'

const router = Router()

const FEED_BASE = 'https://www.huanqiukexue.com'

interface RssFeedItem {
    id: number
    title: string
    link: string
    pubDate: string
    excerpt: string
    image?: string
}

// 提取 XML 标签内容（支持 CDATA）
function extractTag(xml: string, tag: string): string {
    const regex = new RegExp(
        `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))<\\/${tag}>`,
        'i',
    )
    const m = regex.exec(xml)
    if (!m) return ''
    return (m[1] || m[2] || '').trim()
}

// 简易 HTML 实体解码
function decodeEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_: string, code: string) =>
            String.fromCharCode(Number(code)),
        )
}

// 提取 HTML 中首张图片 URL
function extractFirstImage(html: string): string | undefined {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html)
    return m ? m[1] : undefined
}

// 去除 HTML 标签
function stripHtml(text: string): string {
    return text.replace(/<[^>]*>/g, '').trim()
}

// 格式化 RSS 日期为中文友好格式
function formatDate(rssDate: string): string {
    try {
        const d = new Date(rssDate)
        if (isNaN(d.getTime())) return rssDate
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}年${pad(d.getMonth() + 1)}月${pad(d.getDate())}日`
    } catch {
        return rssDate
    }
}

// 解析 RSS XML 为 JSON
function parseRssFeed(xml: string): RssFeedItem[] {
    const items: RssFeedItem[] = []
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let match: RegExpExecArray | null

    while ((match = itemRegex.exec(xml)) !== null) {
        const content = match[1]
        const title = extractTag(content, 'title')
        const link = extractTag(content, 'link')
        const pubDate = extractTag(content, 'pubDate')
        const description = extractTag(content, 'description')
        const encoded = extractTag(content, 'content:encoded')

        // 从链接中提取文章 ID: ?p=4137
        const postIdMatch = link.match(/[?&]p=(\d+)/)
        const postId = postIdMatch ? Number(postIdMatch[1]) : 0

        if (title && postId) {
            const decodedDesc = description ? decodeEntities(description) : ''
            const decodedEncoded = encoded ? decodeEntities(encoded) : ''
            // 图片优先从 content:encoded 提取（含 figure > img），其次从 description
            const image = decodedEncoded
                ? (extractFirstImage(decodedEncoded) || extractFirstImage(decodedDesc))
                : (decodedDesc ? extractFirstImage(decodedDesc) : undefined)
            items.push({
                id: postId,
                title: decodeEntities(title),
                link,
                pubDate: formatDate(pubDate),
                image,
                excerpt: decodedDesc
                    ? stripHtml(decodedDesc).slice(0, 300)
                    : '',
            })
        }
    }
    return items
}

// RSS 分类映射
const CAT_FEEDS: Record<number, string> = {
    4: `${FEED_BASE}/?feed=rss2&cat=4`,
    5: `${FEED_BASE}/?feed=rss2&cat=5`,
    6: `${FEED_BASE}/?feed=rss2&cat=6`,
    7: `${FEED_BASE}/?feed=rss2&cat=7`,
    21: `${FEED_BASE}/?feed=rss2&cat=21`,
}

// GET /api/rss/feed?cat=4
router.get('/feed', async (req: Request, res: Response) => {
    try {
        const cat = req.query.cat ? Number(req.query.cat) : 0
        const url = cat && CAT_FEEDS[cat] ? CAT_FEEDS[cat] : `${FEED_BASE}/?feed=rss2`

        const response = await fetch(url)
        if (!response.ok) {
            res.status(502).json({ error: 'RSS 源请求失败' })
            return
        }
        const xml = await response.text()
        const items = parseRssFeed(xml)
        res.json({ items })
    } catch (err) {
        res.status(500).json({ error: (err as Error).message })
    }
})

// GET /api/rss/post/:id
router.get('/post/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const url = `${FEED_BASE}/index.php?rest_route=/wp/v2/posts/${id}`
        const response = await fetch(url)
        if (!response.ok) {
            res.status(404).json({ error: '文章不存在' })
            return
        }
        const data = await response.json()
        res.json({
            id: data.id,
            title: data.title.rendered,
            content: data.content.rendered,
            date: data.date,
            excerpt: data.excerpt.rendered,
        })
    } catch (err) {
        res.status(500).json({ error: (err as Error).message })
    }
})

export default router
