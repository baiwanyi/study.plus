'use client'

import { type FC } from 'react'
import type { FeynmanEvaluation } from '@shared/types'

interface EvaluationReportProps {
    evaluation: FeynmanEvaluation | null
}

export const EvaluationReport: FC<EvaluationReportProps> = ({ evaluation }) => {
    if (!evaluation) return null

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-yellow-600'
        return 'text-red-600'
    }

    return (
        <div className="space-y-3 text-sm">
            {/* Score ring */}
            <div className="flex items-center gap-4">
                <div className="relative w-16 h-16 shrink-0">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 72 72">
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
                                evaluation.completenessScore >= 80
                                    ? '#22c55e'
                                    : evaluation.completenessScore >= 60
                                      ? '#eab308'
                                      : '#ef4444'
                            }
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${(evaluation.completenessScore / 100) * 188.5} 188.5`}
                        />
                    </svg>
                    <span
                        className={`absolute inset-0 flex items-center justify-center text-base font-bold ${getScoreColor(evaluation.completenessScore)}`}>
                        {evaluation.completenessScore}
                    </span>
                </div>
                <div>
                    <p className="text-xs font-medium text-gray-700">
                        完整度评分
                    </p>
                    <p className="text-xs text-gray-500">
                        {evaluation.completenessComment}
                    </p>
                </div>
            </div>

            {evaluation.missingPoints.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-amber-700 mb-1">
                        📋 可能遗漏的知识点
                    </p>
                    <div className="space-y-1">
                        {evaluation.missingPoints.map((point, i) => (
                            <div
                                key={i}
                                className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
                                💡 {point}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {evaluation.errors.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-red-700 mb-1">
                        ⚠️ 需要再想想的地方
                    </p>
                    <div className="space-y-1">
                        {evaluation.errors.map((err, i) => (
                            <div
                                key={i}
                                className="bg-red-50 rounded-lg px-3 py-1.5">
                                <p className="text-xs text-red-700">
                                    {err.description}
                                </p>
                                <p className="text-xs text-red-500 mt-0.5">
                                    ✅ {err.correction}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {evaluation.improvementSuggestions.length > 0 && (
                <div>
                    <p className="text-xs font-bold text-blue-700 mb-1">
                        💪 改进建议
                    </p>
                    <div className="space-y-1">
                        {evaluation.improvementSuggestions.map((s, i) => (
                            <div
                                key={i}
                                className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                                {s}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {evaluation.overallComment && (
                <div className="bg-green-50 rounded-xl p-3">
                    <p className="text-xs text-green-700 leading-relaxed">
                        💬 {evaluation.overallComment}
                    </p>
                </div>
            )}
        </div>
    )
}
