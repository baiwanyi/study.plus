'use client'

import { useState, useMemo } from 'react'
import { getPageSize, paginate, formatDate } from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import { BorrowStatsCards } from './BorrowStatsCards'
import type { PointAdvance } from '@shared/types'

interface BorrowListTableProps {
    advances: PointAdvance[]
}

function getStatusBadge(status: 'active' | 'completed'): string {
    return status === 'active' ? 'badge-active' : 'badge-completed'
}

function getStatusLabel(status: 'active' | 'completed'): string {
    return status === 'active' ? '进行中' : '已完成'
}

export function BorrowListTable({ advances }: BorrowListTableProps) {
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()

    // Compute statistics (single pass for performance)
    const stats = useMemo(() => {
        let totalAmount = 0
        let totalPaid = 0
        let totalRemaining = 0
        for (const a of advances) {
            totalAmount += a.amount
            const paid = a.paidInstallments * a.installmentAmount
            totalPaid += paid
            if (a.status !== 'completed') {
                totalRemaining += a.totalRepayment - paid
            }
        }
        return { totalAmount, totalPaid, totalRemaining }
    }, [advances])

    const totalPages = Math.max(1, Math.ceil(advances.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const visibleAdvances = paginate(advances, currentPage, pageSize)
    const columns: Column<PointAdvance>[] = useMemo(
        () => [
            {
                key: 'createdAt',
                header: '创建时间',
                render: (adv) => formatDate(adv.createdAt),
            },
            {
                key: 'amount',
                header: '预支积分',
                render: (adv) => (
                    <span className="font-medium text-gray-800">
                        {adv.amount}
                    </span>
                ),
            },
            {
                key: 'installments',
                header: '总期数',
                render: (adv) => (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {adv.installments}期
                    </span>
                ),
            },
            {
                key: 'paid',
                header: '已归还',
                render: (adv) => {
                    const paid = adv.paidInstallments * adv.installmentAmount
                    return <span className="text-gray-600">{paid}</span>
                },
            },
            {
                key: 'remaining',
                header: '未归还',
                render: (adv) => {
                    const paid = adv.paidInstallments * adv.installmentAmount
                    const remaining = adv.totalRepayment - paid
                    return (
                        <span
                            className={`font-medium ${remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {remaining}
                        </span>
                    )
                },
            },
            {
                key: 'status',
                header: '状态',
                render: (adv) => (
                    <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getStatusBadge(adv.status)}`}>
                        {getStatusLabel(adv.status)}
                    </span>
                ),
            },
        ],
        [],
    )

    return (
        <div className="space-y-4">
            <BorrowStatsCards
                totalAmount={stats.totalAmount}
                totalPaid={stats.totalPaid}
                totalRemaining={stats.totalRemaining}
            />

            <div className="card overflow-hidden p-0!">
                <DataTable<PointAdvance>
                    data={visibleAdvances}
                    emptyText="暂无预支记录"
                    rowKey="id"
                    pagination={{
                        current: currentPage,
                        total: advances.length,
                        onChange: (page: number) => setPage(page),
                    }}
                    columns={columns}
                />
            </div>
        </div>
    )
}
