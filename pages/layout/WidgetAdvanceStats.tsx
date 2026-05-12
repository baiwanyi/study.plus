import { useState, useEffect } from 'react'
import { advancesApi } from '@apps/lib/api'
import type { AdvanceSummary } from '@apps/lib/types'

const mockSummary: AdvanceSummary = {
    totalPendingRepayment: 76,
    currentInstallmentDue: 20,
    totalRemainingInstallments: 4,
    remainingCredit: 424,
    maxPendingAmount: 500,
}

export default function WidgetAdvanceStats() {
    const [summary, setSummary] = useState<AdvanceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        advancesApi
            .summary()
            .then((data) => {
                setSummary(data)
                setLoading(false)
            })
            .catch(() => {
                // Fallback to mock data when API not available
                setSummary(mockSummary)
                setError(true)
                setLoading(false)
            })
    }, [])

    if (loading) {
        return (
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-gray-200 rounded w-24" />
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    if (!summary) return null

    return (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                    积分预支概览
                </h3>
                {error && (
                    <span className="text-xs text-amber-500">（示例数据）</span>
                )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* 待归还积分 */}
                <div className="bg-indigo-50 rounded-lg p-3">
                    <p className="text-xs text-indigo-600 font-medium mb-1">
                        待归还积分
                    </p>
                    <p className="text-2xl font-bold text-indigo-700">
                        {summary.totalPendingRepayment}
                    </p>
                    <p className="text-xs text-indigo-400 mt-0.5">分</p>
                </div>

                {/* 1日到期归还积分 */}
                <div className="bg-rose-50 rounded-lg p-3">
                    <p className="text-xs text-rose-600 font-medium mb-1">
                        1日到期归还积分
                    </p>
                    <p className="text-2xl font-bold text-rose-700">
                        {summary.currentInstallmentDue}
                    </p>
                    <p className="text-xs text-rose-400 mt-0.5">
                        剩余 {summary.totalRemainingInstallments} 期
                    </p>
                </div>

                {/* 剩余可预支 */}
                <div className="bg-emerald-50 rounded-lg p-3">
                    <p className="text-xs text-emerald-600 font-medium mb-1">
                        剩余可预支
                    </p>
                    <p className="text-2xl font-bold text-emerald-700">
                        {summary.remainingCredit}
                    </p>
                    <p className="text-xs text-emerald-400 mt-0.5">
                        上限 {summary.maxPendingAmount} 积分
                    </p>
                </div>
            </div>
        </div>
    )
}
