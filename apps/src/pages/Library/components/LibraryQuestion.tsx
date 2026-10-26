/**
 * 题库单题区块：以「题号方块 + 解题思路按钮」起首，题干排在右侧列，展开的思路在下方整行通栏展示。
 * 复用 MarkdownView（开启 KaTeX）渲染题干与思路、useLibraryQuestionHint 管理请求状态，
 * 排版沿用页面引入的 markdown-viewer.css，不引入额外样式文件。
 * 关键约束：题干列与按钮同为 items-start，题号块与入口左右共边（overflow-hidden 容器内）；
 * 思路只含方法与引导问题、不含答案；已保存的思路默认展开，收起后按钮文案回到「解题思路」
 * 且不再请求；生成结果已写回题目文件，未写入时在面板内提示仅本次可见；
 * 展开状态是组件内 UI 状态，切换题目须由父级以 key 重建本组件来重置。
 */
'use client'

import { Loader2, RefreshCw } from 'lucide-react'
import { useMemo } from 'react'
import { MarkdownView } from '@components/MarkdownView'
import { isLibraryHintComplete, stripLibraryHintHeading } from '@shared/utils'
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
        <section className="space-y-3">
            <div className="flex shrink-0 items-start gap-3">
                <div className="flex shrink-0 items-stretch rounded-md border border-gray-300 overflow-hidden">
                    <span className="flex min-w-7 items-center justify-center  bg-gray-300 text-xs  text-gray-700 tabular-nums">
                        {block.number ?? '—'}
                    </span>
                    <button
                        type="button"
                        onClick={isOpen ? close : open}
                        className="btn btn-sm">
                        {isOpen ? '收起' : '思路'}
                    </button>
                </div>
                <div className="min-w-0 flex-1">
                    <MarkdownView
                        content={block.content}
                        className="markdown-viewer"
                        enableMath
                    />
                </div>
            </div>

            {isOpen ? (
                <div className="space-y-3 border rounded-xl border-gray-300 bg-gray-50 p-4 my-3">
                    {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Loader2 className="size-4 animate-spin" />
                            正在整理解题思路…
                        </div>
                    ) : null}
                    {error ? (
                        <div className="space-y-2">
                            <p className="text-sm text-danger">{error}</p>
                            <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => request(body !== '')}>
                                重试
                            </button>
                        </div>
                    ) : null}
                    {/* 重新生成期间先收起旧内容，避免新旧两份思路同时出现；失败时旧内容仍会回到页面 */}
                    {!isLoading && body !== '' ? (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-500">
                                    {isSaved
                                        ? ''
                                        : '未能写入题目文件，仅本次可见'}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-outline btn-sm gap-1"
                                    disabled={isLoading}
                                    onClick={() => request(true)}>
                                    <RefreshCw className="size-3.5" />
                                    换一种思路
                                </button>
                            </div>
                            {isLibraryHintComplete(body) ? null : (
                                <p className="text-xs text-amber-600">
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
            ) : null}
        </section>
    )
}
