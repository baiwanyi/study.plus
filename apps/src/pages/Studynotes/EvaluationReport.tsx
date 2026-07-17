'use client'

import {
    AlertTriangle,
    CheckCircle2,
    ClipboardList,
    Lightbulb,
    MessageSquare,
    Sparkles,
} from 'lucide-react'
import { type FC } from 'react'
import type { StudynotesEvaluation } from '@shared/types'

interface EvaluationReportProps {
    evaluation: StudynotesEvaluation | null
}

export const EvaluationReport: FC<EvaluationReportProps> = ({ evaluation }) => {
    if (!evaluation) return null

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-yellow-600'
        return 'text-red-600'
    }

    return (
        <div className="space-y-4 text-sm">
            {/* Score ring */}
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
                <div className="space-y-1">
                    <p className="font-semibold">完整度评分</p>
                    <p className="text-gray-700">
                        {evaluation.completenessComment}
                    </p>
                </div>
            </div>

            {evaluation.missingPoints.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-amber-700 mb-1 flex items-center gap-1.5">
                        <ClipboardList className="size-4" />
                        可能遗漏的知识点
                    </p>
                    {evaluation.missingPoints.map((point, i) => (
                        <div
                            key={i}
                            className="text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                            <Lightbulb className="size-4 mt-0.5 shrink-0" />
                            <span>{point}</span>
                        </div>
                    ))}
                </div>
            )}

            {evaluation.errors.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-red-700 mb-1 flex items-center gap-1.5">
                        <AlertTriangle className="size-4" />
                        需要再想想的地方
                    </p>
                    {evaluation.errors.map((err, i) => (
                        <div
                            key={i}
                            className="bg-red-50 rounded-lg px-3 py-1.5">
                            <p className="text-red-700">{err.description}</p>
                            <p className="text-red-500 mt-0.5 flex items-start gap-1.5">
                                <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
                                <span>{err.correction}</span>
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {evaluation.improvementSuggestions.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
                        <Sparkles className="size-4" />
                        改进建议
                    </p>
                    {evaluation.improvementSuggestions.map((s, i) => (
                        <div
                            key={i}
                            className="text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                            {s}
                        </div>
                    ))}
                </div>
            )}

            {evaluation.overallComment && (
                <div className="bg-green-50 rounded-xl p-3 flex items-start gap-2">
                    <MessageSquare className="size-4 mt-0.5 shrink-0 text-green-600" />
                    <p className="text-green-700 leading-relaxed">
                        {evaluation.overallComment}
                    </p>
                </div>
            )}
        </div>
    )
}
