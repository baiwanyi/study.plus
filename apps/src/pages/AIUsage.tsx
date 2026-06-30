import { useState, useEffect } from 'react'
import { aiUsageApi } from '@/api'
import type { AIUsageLog, AIUsageSummary } from '@shared/types'
import Loading from '@/components/Loading'
import AISummaryCards from '@/pages/layout/AISummaryCards'
import AISummaryTable from '@/pages/layout/AISummaryTable'
import AIListTable from '@/pages/layout/AIListTable'
export default function AIUsage() {    const [aiLogs, setLogs] = useState<AIUsageLog[]>([])    const [summary, setSummary] = useState<AIUsageSummary[]>([])    const [loading, setLoading] = useState(true)    useEffect(() => {        Promise.all([aiUsageApi.list(), aiUsageApi.summary()])            .then(([logData, summaryData]) => {                setLogs(logData)                setSummary(summaryData)            })            .catch(console.error)            .finally(() => setLoading(false))    }, [])    if (loading) {        return <Loading />    }    return (        <div className="space-y-6">            <h2>DeepSeek API 使用记录</h2>            {/* Summary Cards */}
<AISummaryCards summary={summary} />            {/* Summary Table by Project */}
<AISummaryTable summary={summary} />            {/* Detailed Logs */}
<AIListTable logs={aiLogs} />        </div>    )}