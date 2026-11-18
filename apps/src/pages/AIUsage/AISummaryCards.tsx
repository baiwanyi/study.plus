/**
 * AI 用量汇总卡片：展示总调用次数与总消耗 Token 两项全局指标。
 * 复用约定：数据由父组件传入，数值格式统一复用 formatNumber。
 * 关键约束：卡片只汇总全局指标，各使用项目的明细交由汇总表与日志表呈现。
 */
'use client'

import { formatNumber } from '@apps/utils/client'
import type { AIUsageSummary } from '@shared/types'

interface AISummaryCardsProps {
    summary: AIUsageSummary[]
}

export function AISummaryCards({ summary }: AISummaryCardsProps) {
    const totalTokens = summary.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalCalls = summary.reduce((sum, s) => sum + s.count, 0)

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
    )
}
