/**
 * 本地题目页面：右侧题目清单 + 左侧内容区（按小题分块渲染 / 图片直出）。
 * 复用 useLibrary 管理 URL 驱动的当前文件状态，prepareLibraryContent 完成数学定界符归一化、
 * 分数尺寸统一与选项换行；@shared/utils 的 splitLibraryHints 剥离文末已保存的思路区、
 * splitLibraryAnswer 切出答案段交给 LibraryAnswer 折叠、parseLibraryQuestions 把题干拆成小题块，
 * 逐块渲染 LibraryQuestion（入口在题目正文末尾，已保存的思路随文件加载直接展开）。
 * 关键约束：目录未配置或不存在时须给出明确指引；kind 为 image 的文件直接 <img> 渲染 data URL，
 * 不经过 Markdown 管线与内容预处理；内容渲染开启 KaTeX 以支持数学分数，该开关只在本页启用，
 * 避免影响其他页面既有内容；小题块索引须与解析结果一致（服务端按同一索引取题与写回），
 * 题块 key 需含文件路径，避免切换题目时复用旧组件的思路状态。
 * 响应式：lg 及以上清单常驻右侧；小屏隐藏清单，改为内容区顶部的「题目列表」按钮唤起右侧抽屉。
 * 出卷入口在清单搜索栏的「添加」按钮与空态页，弹窗生成成功后刷新清单并切换到新文件。
 */
'use client'

import { FileQuestion, PanelRight, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import '@apps/styles/markdown-viewer.css'
import { Loading } from '@components/Loading'
import { MarkdownView } from '@components/MarkdownView'
import {
    flattenLibraryInstructionSections,
    parseLibraryQuestions,
    splitLibraryAnswer,
    splitLibraryHints,
} from '@shared/utils'
import { LibraryAnswer } from './components/LibraryAnswer'
import { LibraryModalDelete } from './components/LibraryModalDelete'
import { LibraryModalGenerate } from './components/LibraryModalGenerate'
import { LibraryQuestion } from './components/LibraryQuestion'
import { LibrarySidebar } from './components/LibrarySidebar'
import { useLibrary } from './hooks/useLibrary'
import { prepareLibraryContent } from './utils/libraryScore'
import { isAdmin } from '@apps/utils/client'
import type { LibraryFileMeta } from '@apps/services'

export function Library() {
    const [isListOpen, setIsListOpen] = useState(false)
    const [isGenerateOpen, setIsGenerateOpen] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<LibraryFileMeta | null>(
        null,
    )
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

    // 生成成功后先刷新清单再切到新文件：文件已落盘，内容请求可直接命中
    const handleGenerated = (path: string) => {
        setIsGenerateOpen(false)
        reload()
        selectFile(path)
    }

    // 删除成功：若删的是当前题目，先切到剩余的第一份再刷新，避免详情请求命中已删除文件
    const handleDeleted = (path: string) => {
        setPendingDelete(null)
        if (detail?.path === path) {
            const next = files.find((item) => item.path !== path)
            if (next) selectFile(next.path)
        }
        reload()
    }

    const generateModal = (
        <LibraryModalGenerate
            open={isGenerateOpen}
            onCancel={() => setIsGenerateOpen(false)}
            onGenerated={handleGenerated}
        />
    )

    // 仅 Markdown 走公式/选项预处理、思路区剥离、答案拆分与小题解析；图片的 content 是 data URL，直接交给 <img>。
    // 判定用「非 image 即 Markdown」，以便后端尚未同步升级、响应缺少 kind 时仍按原文渲染
    const article = useMemo(() => {
        if (!detail || detail.kind === 'image') return null
        // 卷首「做题要求/做题建议」若用了数字编号，会被小题解析当成题目并挂上「解题思路」入口，
        // 故解析前先把这两段的编号压成无序列表（对旧文件同样生效）
        // 思路区先按原文剥离，正文再走预览预处理：思路正文由 LibraryQuestion 自行预处理一次，
        // 避免这里处理后再被组件处理第二次（选项行会被重复插入撑高元素）
        const { body, hints } = splitLibraryHints(
            flattenLibraryInstructionSections(detail.content),
        )
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
            <>
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
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            className="btn btn-primary gap-2"
                            onClick={() => setIsGenerateOpen(true)}>
                            <Sparkles className="size-4" />
                            生成题目
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={reload}>
                            重新加载
                        </button>
                    </div>
                </div>
                {generateModal}
            </>
        )
    }

    return (
        <>
            <div className="flex -m-6">
                <LibrarySidebar
                    files={files}
                    currentPath={detail?.path ?? ''}
                    open={isListOpen}
                    onSelect={selectFile}
                    onClose={() => setIsListOpen(false)}
                    onAdd={() => {
                        // 小屏抽屉先收起，避免与弹窗的遮罩层叠加
                        setIsListOpen(false)
                        setIsGenerateOpen(true)
                    }}
                    onRequestDelete={(file) => {
                        setIsListOpen(false)
                        setPendingDelete(file)
                    }}
                />
                <section className="flex-1 min-w-0 flex flex-col max-h-full lg:mr-64">
                    {/* 小屏入口：点击唤起右侧题目清单抽屉 */}
                    <div className="lg:hidden flex items-center gap-3 px-4 py-2.5 bg-white border-b border-gray-200">
                        <span className="flex-1 min-w-0 truncate text-sm text-gray-600">
                            {detail?.title ?? `共 ${files.length} 份`}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsListOpen(true)}
                            aria-label="打开题目列表"
                            aria-expanded={isListOpen}
                            className="btn btn-outline btn-sm gap-1.5 shrink-0">
                            <PanelRight className="size-4" strokeWidth={1.5} />
                            题目列表
                        </button>
                    </div>
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
                                                article.hints.get(block.index)
                                                    ?.markdown ?? ''
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
            {generateModal}
            <LibraryModalDelete
                file={pendingDelete}
                onCancel={() => setPendingDelete(null)}
                onDeleted={handleDeleted}
            />
        </>
    )
}
