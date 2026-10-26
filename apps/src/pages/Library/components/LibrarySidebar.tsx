/**
 * 题库文件列表：按顺序展示目录内的题目清单，支持类型筛选（全部/文档/图片）、关键词过滤与点击切换。
 * 复用 @apps/services 的清单类型与 lucide 图标；序号取自原始顺序、过滤后保持不变，
 * 以与键盘翻页和 URL 定位的次序一致。
 * 关键约束：筛选与搜索只影响清单展示，不改变当前打开的题目（避免切换筛选时触发重新请求）；
 * 过滤无结果时须给出空态提示，避免用户误判目录为空；当前项需有明确选中态；
 * 分值徽标仅在题目声明满分时渲染，图片项没有分值，改以图标标识类型。
 * 响应式：lg 及以上常驻主内容右侧；小屏收为右侧抽屉，开关状态由父组件持有，
 * 选中条目与点击关闭按钮都会回调 onClose 收起抽屉。
 * 关键约束：抽屉展开期间锁住 body 滚动（宽度回到 lg 时自动解锁），滚动只发生在文件列表内部，
 * 且列表隐藏滚动条（复用全局 .scrollbar-hide）以保持抽屉外观整洁。
 * 「添加」按钮紧邻搜索框，只负责唤起父级的 AI 出卷弹窗，不在此处发起请求。
 * 条目悬停时右侧浮出删除按钮（无额外占位，悬停时原徽标淡出），点击仅上报目标文件，
 * 二次确认与删除请求由父级负责，避免误触直接删档。
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon, Plus, Search, Trash2, X } from 'lucide-react'
import type { LibraryFileMeta } from '@apps/services'

interface LibrarySidebarProps {
    files: LibraryFileMeta[]
    currentPath: string
    /** 小屏抽屉是否展开；lg 及以上恒为展开 */
    open: boolean
    onSelect: (path: string) => void
    onClose: () => void
    /** 唤起 AI 出卷弹窗 */
    onAdd: () => void
    /** 点击条目悬停的删除按钮：只上报目标文件，确认与请求由父级处理 */
    onRequestDelete: (file: LibraryFileMeta) => void
}

interface IndexedFile {
    index: number
    file: LibraryFileMeta
}

/** 类型筛选：markdown 归「文档」，image 归「图片」 */
type KindFilter = 'all' | LibraryFileMeta['kind']

const KIND_FILTERS: Array<{ value: KindFilter; label: string }> = [
    { value: 'all', label: '全部' },
    { value: 'markdown', label: '文档' },
    { value: 'image', label: '图片' },
]

export function LibrarySidebar({
    files,
    currentPath,
    open,
    onSelect,
    onClose,
    onAdd,
    onRequestDelete,
}: LibrarySidebarProps) {
    const [keyword, setKeyword] = useState('')
    const [kindFilter, setKindFilter] = useState<KindFilter>('all')

    // 抽屉展开时锁住页面滚动，滚动交给列表自身；窗口回到 lg 后常驻展示，需自动解锁
    useEffect(() => {
        if (!open) return undefined
        const wideQuery = window.matchMedia('(min-width: 1024px)')
        const previousOverflow = document.body.style.overflow
        const syncLock = () => {
            document.body.style.overflow = wideQuery.matches
                ? previousOverflow
                : 'hidden'
        }
        syncLock()
        wideQuery.addEventListener('change', syncLock)
        return () => {
            wideQuery.removeEventListener('change', syncLock)
            document.body.style.overflow = previousOverflow
        }
    }, [open])

    const filtered = useMemo<IndexedFile[]>(() => {
        const indexed = files
            .map((file, index) => ({ index, file }))
            .filter(
                ({ file }) =>
                    kindFilter === 'all' || file.kind === kindFilter,
            )
        const query = keyword.trim().toLowerCase()
        if (!query) return indexed
        return indexed.filter(
            ({ file }) =>
                file.title.toLowerCase().includes(query) ||
                file.path.toLowerCase().includes(query),
        )
    }, [files, keyword, kindFilter])

    return (
        <>
            {/* 小屏抽屉遮罩 */}
            {open && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/40"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}
            <aside
                className={`fixed inset-y-0 right-0 z-50 w-64 shrink-0 flex flex-col overflow-hidden bg-white border-l border-gray-300 transition-transform duration-300 lg:translate-x-0 ${
                    open ? 'translate-x-0' : 'translate-x-full'
                }`}>
                {/* 关闭入口仅小屏抽屉需要 */}
                <div className="shrink-0 lg:hidden flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
                    <span className="text-sm font-medium text-gray-700">
                        题目列表
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="关闭题目列表"
                        className="p-1.5 rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700">
                        <X className="size-5" strokeWidth={1.5} />
                    </button>
                </div>
                <div className="shrink-0 p-3 border-b border-gray-100 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="size-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                className="regular-text pl-8"
                                placeholder="搜索题目"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={onAdd}
                            aria-label="生成题目"
                            className="btn btn-primary btn-sm gap-1 shrink-0">
                            <Plus className="size-4" strokeWidth={2} />
                            添加
                        </button>
                    </div>
                    <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
                        {KIND_FILTERS.map((option) => {
                            const active = option.value === kindFilter
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setKindFilter(option.value)}
                                    className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
                                        active
                                            ? 'bg-white font-medium text-primary shadow-sm'
                                            : 'text-gray-500 hover:text-gray-700'
                                    }`}>
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>
                    <p className="text-xs text-gray-600 pt-1">
                        共 {files.length} 份
                        {filtered.length !== files.length
                            ? `（匹配 ${filtered.length} 份）`
                            : ''}
                    </p>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide p-2 space-y-1">
                    {filtered.length === 0 ? (
                        <p className="text-xs text-gray-400 px-2 py-4">
                            未匹配到题目
                        </p>
                    ) : (
                        filtered.map(({ index, file }) => {
                            const active = file.path === currentPath
                            return (
                                <div key={file.path} className="group relative">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelect(file.path)
                                            onClose()
                                        }}
                                        className={`w-full flex items-center gap-2 px-2.5 py-2 pr-9 rounded-lg text-sm transition-colors ${
                                            active
                                                ? 'bg-gray-100 text-primary font-medium'
                                                : 'text-gray-600 hover:bg-gray-50'
                                        }`}>
                                        <span className="w-5 shrink-0 text-right text-xs text-gray-400 tabular-nums">
                                            {index + 1}
                                        </span>
                                        <span className="flex-1 text-left truncate">
                                            {file.title}
                                        </span>
                                        {/* 悬停时让位给删除按钮，避免两个图标叠在一起 */}
                                        <span className="shrink-0 opacity-100 transition-opacity group-hover:opacity-0">
                                            {file.kind === 'image' ? (
                                                <ImageIcon className="size-3.5 text-gray-400" />
                                            ) : (
                                                file.fullScore != null && (
                                                    <span className="text-xs text-gray-400">
                                                        {file.fullScore} 分
                                                    </span>
                                                )
                                            )}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onRequestDelete(file)
                                        }
                                        aria-label={`删除 ${file.title}`}
                                        title="删除"
                                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-200 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100">
                                        <Trash2
                                            className="size-3.5"
                                            strokeWidth={1.8}
                                        />
                                    </button>
                                </div>
                            )
                        })
                    )}
                </div>
            </aside>
        </>
    )
}
