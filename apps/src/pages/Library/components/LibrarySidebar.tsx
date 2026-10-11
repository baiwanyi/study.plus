/**
 * 题库侧边栏：展示目录内的题目清单，支持关键词过滤与点击切换。
 * 复用 @apps/services 的清单类型与 lucide 图标，过滤只影响展示，不改变翻页顺序。
 * 关键约束：过滤无结果时须给出空态提示，避免用户误判目录为空；
 * 当前项需有明确的选中态，且分值徽标仅在存在满分标注时渲染。
 */
'use client'

import { useMemo, useState } from 'react'
import { FileText, Search } from 'lucide-react'
import type { LibraryFileMeta } from '@apps/services'

interface LibrarySidebarProps {
    files: LibraryFileMeta[]
    currentPath: string
    onSelect: (path: string) => void
}

export function LibrarySidebar({
    files,
    currentPath,
    onSelect,
}: LibrarySidebarProps) {
    const [keyword, setKeyword] = useState('')

    const filtered = useMemo(() => {
        const query = keyword.trim().toLowerCase()
        if (!query) return files
        return files.filter(
            (file) =>
                file.title.toLowerCase().includes(query) ||
                file.path.toLowerCase().includes(query),
        )
    }, [files, keyword])

    return (
        <aside className="w-64 shrink-0 bg-white rounded-lg shadow-sm flex flex-col overflow-hidden">
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
                <p className="text-xs text-gray-400">共 {files.length} 份</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {filtered.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-4">
                        未匹配到题目
                    </p>
                ) : (
                    filtered.map((file) => {
                        const active = file.path === currentPath
                        return (
                            <button
                                key={file.path}
                                type="button"
                                onClick={() => onSelect(file.path)}
                                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                                    active
                                        ? 'bg-primary/10 text-primary font-medium'
                                        : 'text-gray-600 hover:bg-gray-50'
                                }`}>
                                <FileText className="size-4 shrink-0" />
                                <span className="flex-1 text-left truncate">
                                    {file.title}
                                </span>
                                {file.fullScore != null && (
                                    <span className="text-xs text-gray-400 shrink-0">
                                        {file.fullScore} 分
                                    </span>
                                )}
                            </button>
                        )
                    })
                )}
            </div>
        </aside>
    )
}
