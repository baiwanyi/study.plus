import { useState, useEffect } from 'react'
import { aiUsageApi } from '../lib/api'
import type { AIUsageLog, AIUsageSummary } from '../lib/types'

const projectLabels: Record<string, string> = {
    'ai-score': 'AI评分',
    'ai-title': 'AI起名',
}

function formatDateTime(iso: string): string {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    })
}

function formatNumber(n: number): string {
    return n.toLocaleString()
}

const PAGE_SIZE = 20

export default function AIUsage() {
    const [logs, setLogs] = useState<AIUsageLog[]>([])
    const [summary, setSummary] = useState<AIUsageSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [page, setPage] = useState(1)

    useEffect(() => {
        Promise.all([aiUsageApi.list(), aiUsageApi.summary()])
            .then(([logData, summaryData]) => {
                setLogs(logData)
                setSummary(summaryData)
            })
            .catch(console.error)
            .finally(() => setLoading(false))
    }, [])

    const totalTokens = summary.reduce((sum, s) => sum + s.totalTokens, 0)
    const totalCalls = summary.reduce((sum, s) => sum + s.count, 0)
    const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE))
    const pagedLogs = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">加载中...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">DeepSeek API 使用记录</h2>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card">
                    <p className="text-sm text-gray-500">总调用次数</p>
                    <p className="text-2xl font-bold text-gray-900">{formatNumber(totalCalls)}</p>
                </div>
                <div className="card">
                    <p className="text-sm text-gray-500">总消耗 Token</p>
                    <p className="text-2xl font-bold text-indigo-600">{formatNumber(totalTokens)}</p>
                </div>
                {summary.map((s) => (
                    <div key={s.project} className="card">
                        <p className="text-sm text-gray-500">{projectLabels[s.project] || s.project} 调用</p>
                        <p className="text-2xl font-bold text-gray-900">{formatNumber(s.count)}</p>
                        <p className="text-xs text-gray-400 mt-1">
                            {formatNumber(s.totalPromptTokens)} 输入 / {formatNumber(s.totalCompletionTokens)} 输出
                        </p>
                    </div>
                ))}
            </div>

            {/* Summary Table by Project */}
            {summary.length > 0 && (
                <div className="card overflow-hidden !p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">使用项目</th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">调用次数</th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">输入 Token</th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">输出 Token</th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">总 Token</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.map((s) => (
                                <tr key={s.project} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-3 px-4 font-medium text-gray-900">
                                        {projectLabels[s.project] || s.project}
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(s.count)}</td>
                                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(s.totalPromptTokens)}</td>
                                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(s.totalCompletionTokens)}</td>
                                    <td className="py-3 px-4 text-right font-medium text-indigo-600">{formatNumber(s.totalTokens)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Detailed Logs */}
            <div className="card overflow-hidden !p-0">
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <h3 className="text-sm font-medium text-gray-700">详细记录</h3>
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="text-left py-3 px-4 text-gray-500 font-medium">使用项目</th>
                            <th className="text-left py-3 px-4 text-gray-500 font-medium">作业名称</th>
                            <th className="text-right py-3 px-4 text-gray-500 font-medium">作业编号</th>
                            <th className="text-right py-3 px-4 text-gray-500 font-medium">输入 Token</th>
                            <th className="text-right py-3 px-4 text-gray-500 font-medium">输出 Token</th>
                            <th className="text-right py-3 px-4 text-gray-500 font-medium">总 Token</th>
                            <th className="text-right py-3 px-4 text-gray-500 font-medium">使用时间</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="py-8 text-center text-gray-400">暂无记录</td>
                            </tr>
                        ) : (
                            pagedLogs.map((log) => (
                                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-3 px-4 font-medium text-gray-900">
                                        {projectLabels[log.project] || log.project}
                                    </td>
                                    <td className="py-3 px-4 text-gray-600">
                                        {log.taskTitle || '-'}
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-600">
                                        {log.taskId ?? '-'}
                                    </td>
                                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(log.promptTokens)}</td>
                                    <td className="py-3 px-4 text-right text-gray-600">{formatNumber(log.completionTokens)}</td>
                                    <td className="py-3 px-4 text-right font-medium text-indigo-600">{formatNumber(log.totalTokens)}</td>
                                    <td className="py-3 px-4 text-right text-gray-500 text-xs">{formatDateTime(log.createdAt)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                {logs.length > PAGE_SIZE && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                        <p className="text-sm text-gray-500">
                            共 {logs.length} 条，第 {page}/{totalPages} 页
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                上一页
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                下一页
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}