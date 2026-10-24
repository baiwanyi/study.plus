/**
 * 题库单题区块：渲染一道小题（原卷题号 + 题干），并在题目正文末尾紧接「解题思路」入口。
 * 复用 MarkdownView（开启 KaTeX）渲染题干与思路、useLibraryQuestionHint 管理请求状态，
 * 排版沿用页面引入的 markdown-viewer.css，不引入额外样式文件。
 * 关键约束：思路只含方法与引导问题、不含答案；已保存的思路默认展开，收起后按钮变为「查看思路」
 * 且不再请求；生成结果已写回题目文件，未写入时在面板内提示仅本次可见；
 * 展开状态是组件内 UI 状态，切换题目须由父级以 key 重建本组件来重置。
 */
'use client'

import { Lightbulb, Loader2, RefreshCw, X } from 'lucide-react'
import { useMemo } from 'react'
import { MarkdownView } from '@components/MarkdownView'
import {
    isLibraryHintComplete,
    stripLibraryHintHeading,
} from '@shared/utils'
import type { LibraryQuestionBlock } from '@shared/utils'
import { useLibraryQuestionHint } from '../hooks/useLibraryQuestionHint'
import { prepareLibraryContent } from '../utils/libraryScore'

interface LibraryQuestionProps {
    /** 题目文件的题库相对路径，作为请求解题思路的定位参数 */
    path: string
    block: LibraryQuestionBlock
    /** 题目文件中已保存的思路（含条目标题行）；无则为空串 */
    initialHint: string
}

export function LibraryQuestion({
    path,
    block,
    initialHint,
}: LibraryQuestionProps) {
    const { hint, isOpen, isLoading, error, isSaved, open, close, request } =
        useLibraryQuestionHint(path, block.index, initialHint)
    const body = stripLibraryHintHeading(hint)
    // 与题干用同一套预处理：`\(…\)` 归一化为 `$…$`、`\frac` 改写为 `\dfrac`，
    // 否则 KaTeX 只认 `$` 定界符，AI 输出的 `\( \)` 会显示成裸 LaTeX
    const displayBody = useMemo(() => prepareLibraryContent(body), [body])

    return (
        <section className="flex gap-3">
            {block.number ? (
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-background text-xs font-semibold text-primary">
                    {block.number}
                </span>
            ) : null}
            <div className="min-w-0 flex-1">
                <MarkdownView
                    content={block.content}
                    className="markdown-viewer"
                    enableMath
                />
                {/* 入口紧跟在题目正文之后（左对齐），不使用右对齐按钮栏 */}
                {isOpen ? null : (
                    <button
                        type="button"
                        className="btn btn-outline btn-sm mt-1.5 gap-1.5"
                        onClick={open}>
                        <Lightbulb className="size-3.5" />
                        {hint !== '' ? '查看思路' : '解题思路'}
                    </button>
                )}
                {isOpen && error ? (
                    <div className="mt-2 rounded-lg border border-danger/30 bg-warning/5 px-3 py-2">
                        <p className="text-sm text-danger">{error}</p>
                        <button
                            type="button"
                            className="btn btn-outline btn-sm mt-2"
                            onClick={() => request(body !== '')}>
                            重试
                        </button>
                    </div>
                ) : null}
                {isOpen && isLoading ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-100 px-3 py-2 text-sm text-amber-700">
                        <Loader2 className="size-4 animate-spin" />
                        正在整理解题思路…
                    </div>
                ) : null}
                {/* 重新生成期间先收起旧内容，避免新旧两份思路同时出现；失败时旧内容仍会回到页面 */}
                {isOpen && !isLoading && body !== '' ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700">
                                <Lightbulb className="size-4" />
                                解题思路
                                {isSaved ? null : (
                                    <span className="text-xs font-normal text-amber-600">
                                        （未能写入题目文件，仅本次可见）
                                    </span>
                                )}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm gap-1"
                                    disabled={isLoading}
                                    onClick={() => request(true)}>
                                    <RefreshCw className="size-3.5" />
                                    换一种思路
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-outline bg-white btn-sm gap-1"
                                    onClick={close}>
                                    <X className="size-3.5" />
                                    收起
                                </button>
                            </div>
                        </div>
                        {isLibraryHintComplete(body) ? null : (
                            <p className="mb-1.5 text-xs text-amber-600">
                                这份思路可能没生成完整，可点「换一种思路」重新生成。
                            </p>
                        )}
                        <MarkdownView
                            content={displayBody}
                            className="markdown-viewer bg-transparent!"
                            enableMath
                        />
                    </div>
                ) : null}
            </div>
        </section>
    )
}
