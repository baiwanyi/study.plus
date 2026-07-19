'use client'

import { Lightbulb, Sparkles } from 'lucide-react'
import type { AIScoreResult } from '@shared/types'

interface ScoreResultPanelProps {
    result: AIScoreResult | null
    suggestions: string[]
}

const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
}

export function ScoreResultPanel({
    result,
    suggestions,
}: ScoreResultPanelProps) {
    if (!result && suggestions.length === 0) return null

    return (
        <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0 space-y-4">
            {result && (
                <div className="flex items-center gap-4">
                    <div className="relative size-16 shrink-0">
                        <svg className="size-16 -rotate-90" viewBox="0 0 72 72">
                            <circle
                                cx="36"
                                cy="36"
                                r="30"
                                fill="none"
                                stroke="#e5e7eb"
                                strokeWidth="6"
                            />
                            <circle
                                cx="36"
                                cy="36"
                                r="30"
                                fill="none"
                                stroke={
                                    result.score >= 80
                                        ? '#22c55e'
                                        : result.score >= 60
                                          ? '#eab308'
                                          : '#ef4444'
                                }
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={`${Math.max(0, (result.score / 100) * 188.5)} 188.5`}
                            />
                        </svg>
                        <span
                            className={`absolute inset-0 flex items-center justify-center text-base font-bold ${getScoreColor(result.score)}`}>
                            {result.score}
                        </span>
                    </div>
                    <div className="space-y-1">
                        <p className="font-semibold">作业评语</p>
                        <p className="text-sm text-gray-700 leading-relaxed ">
                            {result.comment}
                        </p>
                    </div>
                </div>
            )}
            {suggestions.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                        <Lightbulb className="size-3.5" />
                        改进建议
                    </p>
                    {suggestions.map((s, i) => (
                        <div
                            key={i}
                            className="bg-amber-50 rounded-lg px-3 py-2 text-sm text-amber-700 flex items-start gap-2">
                            <Sparkles className="size-4 mt-0.5 shrink-0" />
                            <span>{s}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
