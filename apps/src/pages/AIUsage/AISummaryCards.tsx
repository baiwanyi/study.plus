'use client'

import { formatNumber, taskAILabels } from '@apps/utils/client'
import type { AIUsageSummary } from '@shared/types'

interface AISummaryCardsProps {
    summary: AIUsageSummary[]
}

export function AISummaryCards({ summary }: AISummaryCardsProps) {
    const totalTokens = summary.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalCalls = summary.reduce((sum, s) => sum + s.count, 0)

    return (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="card">
                <p className="text-sm text-headline">总调用次数</p>
                <p className="text-2xl font-bold text-primary">
                    {formatNumber(totalCalls)}
                </p>
            </div>
            <div className="card">
                <p className="text-sm text-headline">总消耗 Token</p>
                <p className="text-2xl font-bold text-primary">
                    {formatNumber(totalTokens)}
                </p>
            </div>
            {summary.map((s) => (
                <div key={s.project} className="card">
                    <p className="text-sm text-headline">
                        {taskAILabels[s.project as keyof typeof taskAILabels] ||
                            s.project}{' '}
                        调用
                    </p>
                    <p className="text-2xl font-bold text-primary">
                        {formatNumber(s.count)}
                    </p>
                    <p className="text-xs text-muted mt-1">
                        {formatNumber(s.totalPromptTokens)} 输入 /{' '}
                        {formatNumber(s.totalCompletionTokens)} 输出
                    </p>
                </div>
            ))}
        </div>
    )
}
