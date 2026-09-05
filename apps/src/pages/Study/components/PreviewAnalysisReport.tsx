'use client'

import {
    CheckCircle2,
    GraduationCap,
    Lightbulb,
    MessageSquare,
    Sparkles,
} from 'lucide-react'
import { type FC } from 'react'
import type { PreviewAnalysis } from '@shared/types'

interface PreviewAnalysisReportProps {
    analysis: PreviewAnalysis | null
}

export const PreviewAnalysisReport: FC<PreviewAnalysisReportProps> = ({
    analysis,
}) => {
    if (!analysis) return null

    // 防御性裁剪：AI 生成的分数可能越界或非有限值，限制在 0–100 并回退缺省
    const rawScore = Number(analysis.completenessScore)
    const completenessScore = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, Math.round(rawScore)))
        : 0

    // 兜底：AI 生成的数组/字符串可能为 null，先归一化再过滤空元素，避免渲染异常
    const strengths = (analysis.strengths ?? []).filter(Boolean)
    const gaps = (analysis.gaps ?? []).filter(Boolean)
    const classFocusPoints = (analysis.classFocusPoints ?? []).filter(Boolean)
    const overallComment = analysis.overallComment ?? ''

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600'
        if (score >= 60) return 'text-yellow-600'
        return 'text-red-600'
    }

    return (
        <div className="space-y-4 text-sm">
            {/* 完整度评分大圆环（与 EvaluationReport 同款样式） */}
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
                                completenessScore >= 80
                                    ? '#22c55e'
                                    : completenessScore >= 60
                                      ? '#eab308'
                                      : '#ef4444'
                            }
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${Math.max(0, (completenessScore / 100) * 188.5)} 188.5`}
                        />
                    </svg>
                    <span
                        className={`absolute inset-0 flex items-center justify-center text-base font-bold ${getScoreColor(completenessScore)}`}>
                        {completenessScore}
                    </span>
                </div>
                <div className="space-y-1">
                    <p className="font-semibold">完整度评分</p>
                    <p className="text-gray-700">
                        {analysis.completenessComment || ''}
                    </p>
                </div>
            </div>

            {strengths.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-green-700 mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="size-4" />
                        做得好的地方
                    </p>
                    {strengths.map((item, i) => (
                        <div
                            key={i}
                            className="text-green-700 bg-green-50 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                            <Sparkles className="size-4 mt-0.5 shrink-0" />
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}

            {gaps.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-amber-700 mb-1 flex items-center gap-1.5">
                        <Lightbulb className="size-4" />
                        预习不足，可以再想想
                    </p>
                    {gaps.map((item, i) => (
                        <div
                            key={i}
                            className="text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                            <Lightbulb className="size-4 mt-0.5 shrink-0" />
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* 课堂注意事项：核心引导，放在最醒目的位置 */}
            {classFocusPoints.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-1">
                    <p className="font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
                        <GraduationCap className="size-4" />
                        正式课上要注意的重点
                    </p>
                    {classFocusPoints.map((item, i) => (
                        <div
                            key={i}
                            className="text-blue-700 rounded-lg px-1 py-0.5 flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}

            {overallComment && (
                <div className="bg-green-50 rounded-xl p-3 flex items-start gap-2">
                    <MessageSquare className="size-4 mt-0.5 shrink-0 text-green-600" />
                    <p className="text-green-700 leading-relaxed">
                        {overallComment}
                    </p>
                </div>
            )}
        </div>
    )
}
