'use client'

import { ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { WeeklyAnalysis } from '@shared/types'

export interface AnalysisCardsProps {
    analysis: WeeklyAnalysis | null
    analyzing: boolean
    isSplit: boolean
}

interface CardConfig {
    label: string
    key: keyof WeeklyAnalysis
    bg: string
    border: string
    text: string
}

const CARD_CONFIGS: CardConfig[] = [
    {
        label: '表扬与鼓励',
        key: 'praise',
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
    },
    {
        label: '困难与解决方案',
        key: 'difficultyHelp',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-700',
    },
    {
        label: '目标与计划建议',
        key: 'goalAdvice',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
    },
    {
        label: 'AI 助手建议',
        key: 'aiFeedbackAdvice',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
    },
    {
        label: '总体评价',
        key: 'summary',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-700',
    },
]

export function AnalysisCards({
    analysis,
    analyzing,
    isSplit,
}: AnalysisCardsProps) {
    const [collapsed, setCollapsed] = useState(false)

    if (analyzing) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
        )
    }

    return (
        analysis && (
            <div
                className={`space-y-2 text-sm${isSplit ? ' shrink-0 max-h-[40%] overflow-y-auto' : ''}`}>
                {/* Header */}
                <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg">分析报告</h4>
                    <button
                        onClick={() => setCollapsed((c) => !c)}
                        className="btn btn-outline btn-sm"
                        title={collapsed ? '展开' : '收起'}>
                        {collapsed ? (
                            <ChevronDown className="size-4" />
                        ) : (
                            <ChevronUp className="size-4" />
                        )}
                    </button>
                </div>

                {/* Cards */}
                {!collapsed && (
                    <div className="space-y-3 p-3">
                        {CARD_CONFIGS.map(
                            ({ label, key, bg, border, text }) => (
                                <div
                                    key={label}
                                    className={`${bg} border ${border} rounded-lg p-3`}>
                                    <h5 className="font-semibold text-gray-800 mb-1 text-xs">
                                        {label}
                                    </h5>
                                    <p
                                        className={`${text} whitespace-pre-wrap text-xs`}>
                                        {analysis[key]}
                                    </p>
                                </div>
                            ),
                        )}
                    </div>
                )}
            </div>
        )
    )
}
