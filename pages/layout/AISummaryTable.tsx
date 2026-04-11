import type { AIUsageSummary } from '@apps/lib/types'

const projectLabels: Record<string, string> = {
    'ai-score': 'AI评分',
    'ai-title': 'AI起名',
}

function formatNumber(n: number): string {
    return n.toLocaleString()
}

interface AISummaryTableProps {
    summary: AIUsageSummary[]
}

export default function AISummaryTable({ summary }: AISummaryTableProps) {
    if (summary.length === 0) return null

    return (
        <div className="card overflow-hidden !p-0">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">
                            使用项目
                        </th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">
                            调用次数
                        </th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">
                            输入 Token
                        </th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">
                            输出 Token
                        </th>
                        <th className="text-right py-3 px-4 text-gray-500 font-medium">
                            总 Token
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {summary.map((s) => (
                        <tr
                            key={s.project}
                            className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-3 px-4 font-medium text-gray-900">
                                {projectLabels[s.project] || s.project}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                                {formatNumber(s.count)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                                {formatNumber(s.totalPromptTokens)}
                            </td>
                            <td className="py-3 px-4 text-right text-gray-600">
                                {formatNumber(s.totalCompletionTokens)}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-indigo-600">
                                {formatNumber(s.totalTokens)}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
