/**
 * 富文本清洗工具：为 Mermaid 渲染结果提供注入 innerHTML 前的安全过滤。
 * 复用 DOMPurify 的 svg/svgFilters profile，阻断事件处理器、外链脚本等 XSS 向量。
 * 关键约束：清洗白名单由 DOMPurify profile 决定，不得改用 html profile 或追加
 * 自定义属性，否则会放行可执行内容；调用方必须在 innerHTML 赋值前完成清洗。
 */
import DOMPurify from 'dompurify'

// SVG 清洗：用于 Mermaid 渲染结果（innerHTML 注入前），
// 仅允许 SVG profile，阻断事件处理器与外链脚本
export function sanitizeSvg(dirty: string): string {
    return DOMPurify.sanitize(dirty, {
        USE_PROFILES: { svg: true, svgFilters: true },
    })
}
