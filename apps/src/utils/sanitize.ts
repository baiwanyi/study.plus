import DOMPurify from 'dompurify'

// 富文本清洗：用于渲染第三方/用户可控 HTML（如 RSS 文章详情），
// 仅允许安全标签与属性，阻断 script、事件处理器、javascript:/data: 协议等 XSS 向量
export function sanitizeHtml(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        USE_PROFILES: { html: true },
        ADD_ATTR: ['target', 'rel'],
    })
}

// SVG 清洗：用于 Mermaid 渲染结果（innerHTML 注入前），
// 仅允许 SVG profile，阻断事件处理器与外链脚本
export function sanitizeSvg(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        USE_PROFILES: { svg: true, svgFilters: true },
    })
}
