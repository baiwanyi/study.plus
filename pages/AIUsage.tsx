import { useState, useEffect } from 'react'
import { aiUsageApi } from '@apps/lib/api'
import type { AIUsageLog, AIUsageSummary } from '@apps/lib/types'
import Loading from '@/apps/components/Loading'
import AISummaryCards from '@layout/AISummaryCards'
import AISummaryTable from '@layout/AISummaryTable'
import AIListTable from '@/pages/layout/AIListTable'

export default function AIUsage() {
    const [aiLogs, setLogs] = useState<AIUsageLog[]>([])
    const [summary, setSummary] = useState<AIUsageSummary[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        Promise.all([aiUsageApi.list(), aiUsageApi.summary()])
            .then(([logData, summaryData]) => {
                setLogs(logData)
                setSummary(summaryData)
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    if (loading) {
        return <Loading />
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
                DeepSeek API 使用记录
            </h2>

            {/* Summary Cards */}
            <AISummaryCards summary={summary} />

            {/* Summary Table by Project */}
            <AISummaryTable summary={summary} />

            {/* Detailed Logs */}
            <AIListTable logs={aiLogs} />
        </div>
    )
}
