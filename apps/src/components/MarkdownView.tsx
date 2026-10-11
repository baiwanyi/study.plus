/**
 * 只读 Markdown 渲染组件：统一封装 @uiw/react-md-editor 的预览能力供全站复用。
 * 预览底层为 @uiw/react-markdown-preview（已内置 remark-gfm 与 rehype-raw）。
 * 关键约束：数学公式渲染依赖 remark-math/rehype-katex，默认关闭——存量内容里成对的
 * `$` 会被误判为公式，故仅题库等明确需要公式的页面通过 enableMath 开启。
 */
'use client'

import MDEditor from '@uiw/react-md-editor'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import 'katex/dist/katex.min.css'

interface MarkdownViewProps {
    content: string
    className?: string
    /** 是否启用 KaTeX 数学公式渲染（默认关闭，避免影响既有页面） */
    enableMath?: boolean
}

export function MarkdownView({
    content,
    className = '',
    enableMath = false,
}: MarkdownViewProps) {
    return (
        <div data-color-mode="light">
            <MDEditor.Markdown
                source={content}
                className={className}
                remarkPlugins={enableMath ? [remarkMath] : undefined}
                rehypePlugins={enableMath ? [rehypeKatex] : undefined}
            />
        </div>
    )
}
