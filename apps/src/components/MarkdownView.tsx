'use client'

import MDEditor from '@uiw/react-md-editor'

interface MarkdownViewProps {
    content: string
    className?: string
}

// 只读 Markdown 渲染：复用项目既有的 @uiw/react-md-editor，
// 其内部预览默认启用 rehype-sanitize 做 XSS 防护。
export function MarkdownView({ content, className = '' }: MarkdownViewProps) {
    return (
        <div data-color-mode="light">
            <MDEditor.Markdown source={content} className={className} />
        </div>
    )
}
