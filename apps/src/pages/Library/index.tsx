/**
 * 本地题目页面：左侧题目清单 + 右侧内容区（Markdown 渲染 / 图片直出）。
 * 复用 useLibrary 管理 URL 驱动的当前文件状态（清单点击或键盘左右键切换），
 * prepareLibraryContent 在渲染前完成数学定界符归一化、分数尺寸统一与选项换行，
 * splitLibraryAnswer 再把「参考答案」段切出交给 LibraryAnswer 默认折叠，MarkdownView 负责只读渲染。
 * 关键约束：目录未配置或不存在时须给出明确指引；kind 为 image 的文件直接 <img> 渲染 data URL，
 * 不经过 Markdown 管线与内容预处理；内容渲染开启 KaTeX 以支持数学分数，该开关只在本页启用，
 * 避免影响其他页面既有内容；Markdown 排版依赖随本页引入的样式文件。
 */
'use client'

import { FileQuestion } from 'lucide-react'
import { useMemo } from 'react'
import '@apps/styles/markdown-viewer.css'
import { Loading } from '@components/Loading'
import { MarkdownView } from '@components/MarkdownView'
import { LibraryAnswer } from './components/LibraryAnswer'
import { LibrarySidebar } from './components/LibrarySidebar'
import { useLibrary } from './hooks/useLibrary'
import {
    prepareLibraryContent,
    splitLibraryAnswer,
} from './utils/libraryScore'

export function Library() {
    const {
        dir,
        exists,
        files,
        detail,
        listLoading,
        detailLoading,
        listError,
        detailError,
        selectFile,
        reload,
    } = useLibrary()

    // 仅 Markdown 走公式/选项预处理与答案拆分；图片的 content 是 data URL，直接交给 <img>。
    // 判定用「非 image 即 Markdown」，以便后端尚未同步升级、响应缺少 kind 时仍按原文渲染
    const article = useMemo(() => {
        if (!detail || detail.kind === 'image') return null
        return {
            path: detail.path,
            ...splitLibraryAnswer(prepareLibraryContent(detail.content)),
        }
    }, [detail])

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
                        ? `目录「${dir}」下暂无题目文件`
                        : `题目目录「${dir}」不存在`}
                </p>
                <p className="text-xs text-gray-400">
                    请将 .md 题目或图片文件放入该目录，或在「配置选项 → 系统设置 →
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
        <div className="flex gap-4 h-[calc(100vh-3rem)] min-h-128">
            <LibrarySidebar
                files={files}
                currentPath={detail?.path ?? ''}
                onSelect={selectFile}
            />
            <section className="flex-1 min-w-0 flex flex-col">
                <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm p-8">
                    {detailLoading ? (
                        <Loading />
                    ) : detailError ? (
                        <p className="text-gray-500">{detailError}</p>
                    ) : detail?.kind === 'image' ? (
                        <div className="h-full flex items-center justify-center">
                            <img
                                src={detail.content}
                                alt={detail.title}
                                className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                            />
                        </div>
                    ) : article ? (
                        <>
                            {article.question ? (
                                <MarkdownView
                                    content={article.question}
                                    className="markdown-viewer"
                                    enableMath
                                />
                            ) : null}
                            {article.answer ? (
                                <LibraryAnswer
                                    key={article.path}
                                    answer={article.answer}
                                />
                            ) : null}
                        </>
                    ) : null}
                </div>
            </section>
        </div>
    )
}
