import type { AIUsageSummary } from '@apps/lib/types'

const projectLabels: Record<string, string> = {
    'ai-score': 'AI评分',
    'ai-title': 'AI起名',
}

function formatNumber(n: number): string {
    return n.toLocaleString()
}

interface AISummaryCardsProps {
    summary: AIUsageSummary[]
}

export default function AISummaryCards({ summary }: AISummaryCardsProps) {
    const totalTokens = summary.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalCalls = summary.reduce((sum, s) => sum + s.count, 0)

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
                <p className="text-sm text-gray-500">总调用次数</p>
                <p className="text-2xl font-bold text-gray-900">
                    {formatNumber(totalCalls)}
                </p>
            </div>
            <div className="card">
                <p className="text-sm text-gray-500">总消耗 Token</p>
                <p className="text-2xl font-bold text-indigo-600">
                    {formatNumber(totalTokens)}
                </p>
            </div>
            {summary.map((s) => (
                <div key={s.project} className="card">
                    <p className="text-sm text-gray-500">
                        {projectLabels[s.project] || s.project} 调用
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                        {formatNumber(s.count)}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                        {formatNumber(s.totalPromptTokens)} 输入 /{' '}
                        {formatNumber(s.totalCompletionTokens)} 输出
                    </p>
                </div>
            ))}
        </div>
    )
}
