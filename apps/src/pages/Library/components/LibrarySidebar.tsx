/**
 * 题库侧边栏：按顺序展示目录内的题目清单，支持类型筛选（全部/文档/图片）、关键词过滤与点击切换。
 * 复用 @apps/services 的清单类型与 lucide 图标；序号取自原始顺序、过滤后保持不变，
 * 以与键盘翻页和 URL 定位的次序一致。
 * 关键约束：筛选与搜索只影响清单展示，不改变当前打开的题目（避免切换筛选时触发重新请求）；
 * 过滤无结果时须给出空态提示，避免用户误判目录为空；当前项需有明确选中态；
 * 分值徽标仅在题目声明满分时渲染，图片项没有分值，改以图标标识类型。
 */
'use client'

import { useMemo, useState } from 'react'
import { Image as ImageIcon, Search } from 'lucide-react'
import type { LibraryFileMeta } from '@apps/services'

interface LibrarySidebarProps {
    files: LibraryFileMeta[]
    currentPath: string
    onSelect: (path: string) => void
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
    onSelect,
}: LibrarySidebarProps) {
    const [keyword, setKeyword] = useState('')
    const [kindFilter, setKindFilter] = useState<KindFilter>('all')

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
        <aside className="w-64 shrink-0 bg-white flex-col overflow-hidden border-r border-gray-300 fixed h-full hidden lg:flex">
            <div className="p-3 border-b border-gray-100 space-y-2">
                <div className="relative">
                    <Search className="size-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        className="regular-text pl-8"
                        placeholder="搜索题目"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                    />
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
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-4">
                        未匹配到题目
                    </p>
                ) : (
                    filtered.map(({ index, file }) => {
                        const active = file.path === currentPath
                        return (
                            <button
                                key={file.path}
                                type="button"
                                onClick={() => onSelect(file.path)}
                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
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
                                {file.kind === 'image' ? (
                                    <ImageIcon className="size-3.5 shrink-0 text-gray-400" />
                                ) : (
                                    file.fullScore != null && (
                                        <span className="text-xs text-gray-400 shrink-0">
                                            {file.fullScore} 分
                                        </span>
                                    )
                                )}
                            </button>
                        )
                    })
                )}
            </div>
        </aside>
    )
}
