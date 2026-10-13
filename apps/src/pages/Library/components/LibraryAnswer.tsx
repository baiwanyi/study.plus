/**
 * 题库答案折叠区块：默认只渲染「显示答案」按钮，点击后才展开参考答案内容。
 * 复用 MarkdownView（开启 KaTeX）渲染答案 Markdown，排版沿用页面引入的
 * markdown-viewer.css，不引入额外依赖。
 * 关键约束：折叠状态是组件内 UI 状态，切换题目须由父级以 key 重建本组件来重置，
 * 不依赖 effect 监听题目变化；答案未展开时不进入渲染树，避免答案被提前读到。
 */
'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { MarkdownView } from '@components/MarkdownView'

interface LibraryAnswerProps {
    answer: string
}

export function LibraryAnswer({ answer }: LibraryAnswerProps) {
    const [visible, setVisible] = useState(false)

    if (!visible) {
        return (
            <div className="mt-6 flex justify-center">
                <button
                    type="button"
                    className="btn btn-outline gap-2"
                    onClick={() => setVisible(true)}>
                    <Eye className="size-4" />
                    显示答案
                </button>
            </div>
        )
    }

    return (
        <div className="mt-6">
            <div className="flex justify-end">
                <button
                    type="button"
                    className="btn btn-outline btn-sm gap-2"
                    onClick={() => setVisible(false)}>
                    <EyeOff className="size-4" />
                    隐藏答案
                </button>
            </div>
            <MarkdownView
                content={answer}
                className="markdown-viewer"
                enableMath
            />
        </div>
    )
}
