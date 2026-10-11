/**
 * 本地题目页面：左侧题目清单 + 右侧 Markdown 渲染，底部提供上一篇/下一篇切换。
 * 复用 useLibrary 管理 URL 驱动的当前文件状态，MarkdownView 承担只读渲染，
 * analyzeLibraryContent 在渲染前完成分值高亮与总分统计。
 * 关键约束：目录未配置或不存在时须给出明确指引；内容渲染开启 KaTeX 以支持数学分数，
 * 该开关只在本页启用，避免影响其他页面既有内容的渲染结果。
 */
'use client'

import { useMemo } from 'react'
import { FileQuestion } from 'lucide-react'
import { Loading } from '@components/Loading'
import { MarkdownView } from '@components/MarkdownView'
import { LibraryPager } from './components/LibraryPager'
import { LibrarySidebar } from './components/LibrarySidebar'
import { useLibrary } from './hooks/useLibrary'
import { analyzeLibraryContent } from './utils/libraryScore'

export function Library() {
    const {
        dir,
        exists,
        files,
        currentIndex,
        detail,
        listLoading,
        detailLoading,
        listError,
        detailError,
        selectFile,
        goPrev,
        goNext,
        reload,
    } = useLibrary()

    const summary = useMemo(
        () => (detail ? analyzeLibraryContent(detail.content) : null),
        [detail],
    )

    if (listLoading) return <Loading />

    if (listError) {
        return (
            <div className="flex flex-col items-center justify-center mt-24 gap-4">
                <FileQuestion className="size-16 text-gray-300" />
                <p className="text-gray-500">{listError}</p>
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={reload}>
                    重试
                </button>
            </div>
        )
    }

    if (!exists || files.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center mt-24 gap-3">
                <FileQuestion className="size-16 text-gray-300" />
                <p className="text-gray-500">
                    {exists
                        ? `目录「${dir}」下暂无 Markdown 题目`
                        : `题目目录「${dir}」不存在`}
                </p>
                <p className="text-xs text-gray-400">
                    请将 .md 题目文件放入该目录，或在「配置选项 → 系统设置 →
                    本地题目目录路径」中指定其他目录
                </p>
                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={reload}>
                    重新加载
                </button>
            </div>
        )
    }

    return (
        <div className="flex gap-4 h-[calc(100vh-3rem)] min-h-[32rem]">
            <LibrarySidebar
                files={files}
                currentPath={detail?.path ?? ''}
                onSelect={selectFile}
            />
            <section className="flex-1 min-w-0 flex flex-col">
                <header className="flex items-center flex-wrap gap-3">
                    <h2 className="text-xl font-semibold text-gray-900 truncate">
                        {detail?.title ?? '未选择题目'}
                    </h2>
                    {detail?.fullScore != null && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-sm font-medium">
                            满分 {detail.fullScore} 分
                        </span>
                    )}
                    {summary && summary.count > 0 && (
                        <span className="text-xs text-gray-400">
                            共 {summary.count} 处分值标注
                        </span>
                    )}
                </header>
                {detail && (
                    <p className="text-xs text-gray-400 mt-1">{detail.path}</p>
                )}
                <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm p-8 mt-3">
                    {detailLoading ? (
                        <Loading />
                    ) : detailError ? (
                        <p className="text-gray-500">{detailError}</p>
                    ) : summary ? (
                        <MarkdownView
                            content={summary.annotated}
                            className="markdown-viewer"
                            enableMath
                        />
                    ) : null}
                </div>
                <LibraryPager
                    index={currentIndex >= 0 ? currentIndex : 0}
                    total={files.length}
                    onPrev={goPrev}
                    onNext={goNext}
                />
            </section>
        </div>
    )
}
