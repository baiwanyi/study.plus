/**
 * 题库翻页条：展示当前序号与总数，提供上一份 / 下一份切换入口。
 * 复用 lucide 图标与全局 btn 样式，序号与边界由调用方（useLibrary）计算好后传入。
 * 关键约束：首份与末份分别禁用对应按钮，禁用态保留占位避免布局抖动；
 * 该组件只负责展示与回调，不自行维护索引状态。
 */
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface LibraryPagerProps {
    index: number
    total: number
    onPrev: () => void
    onNext: () => void
}

export function LibraryPager({
    index,
    total,
    onPrev,
    onNext,
}: LibraryPagerProps) {
    const hasPrev = index > 0
    const hasNext = index >= 0 && index < total - 1

    return (
        <div className="flex items-center justify-between gap-3 pt-3">
            <button
                type="button"
                className="btn btn-outline flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!hasPrev}
                onClick={onPrev}>
                <ChevronLeft className="size-4" />
                上一篇
            </button>
            <span className="text-sm text-gray-500">
                {total > 0 ? `${index + 1} / ${total}` : '— / —'}
            </span>
            <button
                type="button"
                className="btn btn-outline flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={!hasNext}
                onClick={onNext}>
                下一篇
                <ChevronRight className="size-4" />
            </button>
        </div>
    )
}
