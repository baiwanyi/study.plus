'use client'

import { taskAILabels, formatNumber } from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import type { AIUsageSummary } from '@shared/types'

const columns: Column<AIUsageSummary>[] = [
    {
        key: 'project',
        header: '使用项目',
        render: (s) => (
            <span className="font-medium text-heading">
                {taskAILabels[s.project as keyof typeof taskAILabels] ||
                    s.project}
            </span>
        ),
    },
    { key: 'count', header: '调用次数', render: (s) => formatNumber(s.count) },
    {
        key: 'totalPromptTokens',
        header: '输入 Token',
        render: (s) => formatNumber(s.totalPromptTokens),
    },
    {
        key: 'totalCompletionTokens',
        header: '输出 Token',
        render: (s) => formatNumber(s.totalCompletionTokens),
    },
    {
        key: 'totalTokens',
        header: '总 Token',
        render: (s) => (
            <span className="font-medium text-primary">
                {formatNumber(s.totalTokens)}
            </span>
        ),
    },
]

interface AISummaryTableProps {
    summary: AIUsageSummary[]
}

export function AISummaryTable({ summary }: AISummaryTableProps) {
    if (summary.length === 0) return null

    return (
        <div className="card overflow-hidden p-0!">
            <DataTable<AIUsageSummary>
                data={summary}
                columns={columns}
                rowKey="project"
            />
        </div>
    )
}
