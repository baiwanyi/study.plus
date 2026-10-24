/**
 * 本地题目页面：左侧题目清单 + 右侧内容区（按小题分块渲染 / 图片直出）。
 * 复用 useLibrary 管理 URL 驱动的当前文件状态，prepareLibraryContent 完成数学定界符归一化、
 * 分数尺寸统一与选项换行；@shared/utils 的 splitLibraryHints 剥离文末已保存的思路区、
 * splitLibraryAnswer 切出答案段交给 LibraryAnswer 折叠、parseLibraryQuestions 把题干拆成小题块，
 * 逐块渲染 LibraryQuestion（入口在题目正文末尾，已保存的思路随文件加载直接展开）。
 * 关键约束：目录未配置或不存在时须给出明确指引；kind 为 image 的文件直接 <img> 渲染 data URL，
 * 不经过 Markdown 管线与内容预处理；内容渲染开启 KaTeX 以支持数学分数，该开关只在本页启用，
 * 避免影响其他页面既有内容；小题块索引须与解析结果一致（服务端按同一索引取题与写回），
 * 题块 key 需含文件路径，避免切换题目时复用旧组件的思路状态。
 */
'use client'

import { FileQuestion } from 'lucide-react'
import { useMemo } from 'react'
import '@apps/styles/markdown-viewer.css'
import { Loading } from '@components/Loading'
import { MarkdownView } from '@components/MarkdownView'
import {
    parseLibraryQuestions,
    splitLibraryAnswer,
    splitLibraryHints,
} from '@shared/utils'
import { LibraryAnswer } from './components/LibraryAnswer'
import { LibraryQuestion } from './components/LibraryQuestion'
import { LibrarySidebar } from './components/LibrarySidebar'
import { useLibrary } from './hooks/useLibrary'
import { prepareLibraryContent } from './utils/libraryScore'
import { isAdmin } from '@apps/utils/client'

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

    // 仅 Markdown 走公式/选项预处理、思路区剥离、答案拆分与小题解析；图片的 content 是 data URL，直接交给 <img>。
    // 判定用「非 image 即 Markdown」，以便后端尚未同步升级、响应缺少 kind 时仍按原文渲染
    const article = useMemo(() => {
        if (!detail || detail.kind === 'image') return null
        // 思路区先按原文剥离，正文再走预览预处理：思路正文由 LibraryQuestion 自行预处理一次，
        // 避免这里处理后再被组件处理第二次（选项行会被重复插入撑高元素）
        const { body, hints } = splitLibraryHints(detail.content)
        const { question, answer } = splitLibraryAnswer(
            prepareLibraryContent(body),
        )
        return {
            path: detail.path,
            answer,
            blocks: parseLibraryQuestions(question),
            hints,
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
                    请将 .md 题目或图片文件放入该目录，或在「配置选项 → 系统设置
                    → 本地题目目录路径」中指定其他目录
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
        <div className="flex -m-6">
            <LibrarySidebar
                files={files}
                currentPath={detail?.path ?? ''}
                onSelect={selectFile}
            />
            <section className="flex-1 lg:ml-64 min-w-0 flex flex-col max-h-full">
                {detailLoading ? (
                    <Loading />
                ) : detailError ? (
                    <p className="text-gray-500">{detailError}</p>
                ) : detail?.kind === 'image' ? (
                    <div className="h-full flex items-center justify-center p-8">
                        <img
                            src={detail.content}
                            alt={detail.title}
                            className="max-h-full max-w-full object-contain rounded-lg shadow-sm"
                        />
                    </div>
                ) : article ? (
                    <div className="flex-1 p-8 bg-white">
                        <div className="flex flex-col gap-5">
                            {article.blocks.map((block) =>
                                block.kind === 'text' ? (
                                    <MarkdownView
                                        key={`${article.path}#${block.index}`}
                                        content={block.content}
                                        className="markdown-viewer"
                                        enableMath
                                    />
                                ) : (
                                    <LibraryQuestion
                                        key={`${article.path}#${block.index}`}
                                        path={article.path}
                                        block={block}
                                        initialHint={
                                            article.hints.get(block.index)?.markdown ?? ''
                                        }
                                    />
                                ),
                            )}
                        </div>
                        {article.answer && isAdmin() ? (
                            <LibraryAnswer
                                key={article.path}
                                answer={article.answer}
                            />
                        ) : null}
                    </div>
                ) : null}
            </section>
        </div>
    )
}
