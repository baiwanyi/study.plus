'use client'

import { CheckCircle2, GraduationCap, Lightbulb, MessageSquare, Sparkles } from 'lucide-react'
import { type FC } from 'react'
import type { PreviewAnalysis } from '@shared/types'

interface PreviewAnalysisReportProps {
    analysis: PreviewAnalysis | null
}

export const PreviewAnalysisReport: FC<PreviewAnalysisReportProps> = ({
    analysis,
}) => {
    if (!analysis) return null

    return (
        <div className="space-y-4 text-sm">
            {/* 完整度（弱化展示：小徽章 + 评价，不设大圆环避免评估焦虑） */}
            <div className="flex items-center gap-3">
                <span className="shrink-0 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    预习完整度 {analysis.completenessScore}
                </span>
                <p className="text-gray-700">{analysis.completenessComment}</p>
            </div>

            {analysis.strengths.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-green-700 mb-1 flex items-center gap-1.5">
                        <CheckCircle2 className="size-4" />
                        做得好的地方
                    </p>
                    {analysis.strengths.map((item, i) => (
                        <div
                            key={i}
                            className="text-green-700 bg-green-50 rounded-lg px-3 py-1.5 flex items-start gap-1.5">
                            <Sparkles className="size-4 mt-0.5 shrink-0" />
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}

            {analysis.gaps.length > 0 && (
                <div className="space-y-1">
                    <p className="font-semibold text-amber-700 mb-1 flex items-center gap-1.5">
                        <Lightbulb className="size-4" />
                        预习不足，可以再想想
                    </p>
                    {analysis.gaps.map((item, i) => (
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
            {analysis.classFocusPoints.length > 0 && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 space-y-1">
                    <p className="font-semibold text-blue-700 mb-1 flex items-center gap-1.5">
                        <GraduationCap className="size-4" />
                        正式课上要注意的重点
                    </p>
                    {analysis.classFocusPoints.map((item, i) => (
                        <div
                            key={i}
                            className="text-blue-700 rounded-lg px-1 py-0.5 flex items-start gap-1.5">
                            <span className="mt-0.5 shrink-0">•</span>
                            <span>{item}</span>
                        </div>
                    ))}
                </div>
            )}

            {analysis.overallComment && (
                <div className="bg-green-50 rounded-xl p-3 flex items-start gap-2">
                    <MessageSquare className="size-4 mt-0.5 shrink-0 text-green-600" />
                    <p className="text-green-700 leading-relaxed">
                        {analysis.overallComment}
                    </p>
                </div>
            )}
        </div>
    )
}
