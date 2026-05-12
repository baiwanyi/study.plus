import { useState, useMemo } from 'react'
import type { PointAdvance } from '@apps/lib/types'
import { getPageSize, paginate } from '@apps/lib/utils'

interface BorrowListTableProps {
    advances: PointAdvance[]
    loading: boolean
}

function formatDate(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function getStatusBadge(status: 'active' | 'completed'): string {
    return status === 'active' ? 'badge-active' : 'badge-completed'
}

function getStatusLabel(status: 'active' | 'completed'): string {
    return status === 'active' ? '进行中' : '已完成'
}

export default function BorrowListTable({
    advances,
    loading,
}: BorrowListTableProps) {
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()

    // Compute statistics
    const stats = useMemo(() => {
        const totalAmount = advances.reduce((s, a) => s + a.amount, 0)
        const totalPaid = advances.reduce(
            (s, a) => s + a.paidInstallments * a.installmentAmount,
            0,
        )
        const totalRemaining = advances.reduce((s, a) => {
            if (a.status === 'completed') return s
            return s + (a.totalRepayment - a.paidInstallments * a.installmentAmount)
        }, 0)
        return { totalAmount, totalPaid, totalRemaining }
    }, [advances])

    const totalPages = Math.max(1, Math.ceil(advances.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const visibleAdvances = paginate(advances, currentPage, pageSize)

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-20 bg-gray-100 rounded-xl" />
                    ))}
                </div>
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-1">
                        预支总额
                    </p>
                    <p className="text-2xl font-bold text-gray-800">
                        {stats.totalAmount}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-1">
                        已归还
                    </p>
                    <p className="text-2xl font-bold text-emerald-600">
                        {stats.totalPaid}
                    </p>
                </div>
                <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-1">
                        未归还
                    </p>
                    <p className="text-2xl font-bold text-rose-600">
                        {stats.totalRemaining}
                    </p>
                </div>
            </div>

            {/* Table */}
            {advances.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    暂无预支记录
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-2 text-gray-500 font-medium">
                                        创建时间
                                    </th>
                                    <th className="text-right py-3 px-2 text-gray-500 font-medium">
                                        预支积分
                                    </th>
                                    <th className="text-center py-3 px-2 text-gray-500 font-medium">
                                        总期数
                                    </th>
                                    <th className="text-right py-3 px-2 text-gray-500 font-medium">
                                        已归还
                                    </th>
                                    <th className="text-right py-3 px-2 text-gray-500 font-medium">
                                        未归还
                                    </th>
                                    <th className="text-center py-3 px-2 text-gray-500 font-medium">
                                        状态
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleAdvances.map((adv) => {
                                    const paid = adv.paidInstallments * adv.installmentAmount
                                    const remaining = adv.totalRepayment - paid
                                    return (
                                        <tr
                                            key={adv.id}
                                            className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                                        >
                                            <td className="py-3 px-2 text-gray-600">
                                                {formatDate(adv.createdAt)}
                                            </td>
                                            <td className="py-3 px-2 text-right font-medium text-gray-800">
                                                {adv.amount}
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                                    {adv.installments}期
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-right text-gray-600">
                                                {paid}
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <span
                                                    className={`font-medium ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                                                >
                                                    {remaining}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-center">
                                                <span
                                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(adv.status)}`}
                                                >
                                                    {getStatusLabel(adv.status)}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-gray-400">
                                共 {advances.length} 条记录
                            </p>
                            <div className="flex items-center gap-2">
                                <button
                                    className="px-3 py-1 text-sm rounded-md border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    disabled={currentPage <= 1}
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                >
                                    ← 上一页
                                </button>
                                <span className="text-sm text-gray-500">
                                    {currentPage}/{totalPages}
                                </span>
                                <button
                                    className="px-3 py-1 text-sm rounded-md border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                    disabled={currentPage >= totalPages}
                                    onClick={() =>
                                        setPage((p) => p + 1)
                                    }
                                >
                                    下一页 →
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
