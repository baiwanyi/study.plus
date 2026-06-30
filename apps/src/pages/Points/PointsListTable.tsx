'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
    formatDate,
    pointTypeLabels,
    pointTypeColors,
    paginate,
    getPageSize,
} from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import type { PointRecord } from '@shared/types'

interface PointsListTableProps {
    records: PointRecord[]
}

export function PointsListTable({ records }: PointsListTableProps) {
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()
    const prevLenRef = useRef(records.length)
    const pagedRecords = useMemo(
        () => paginate(records, page, pageSize),
        [records, page, pageSize],
    )

    useEffect(() => {
        if (records.length !== prevLenRef.current) {
            prevLenRef.current = records.length
            setPage(1)
        }
    }, [records.length])

    const columns: Column<PointRecord>[] = [
        {
            key: 'createdAt',
            header: '时间',
            render: (record) => (
                <span className="text-xs text-gray-600">
                    {formatDate(record.createdAt)}
                </span>
            ),
        },
        {
            key: 'type',
            header: '类型',
            render: (record) => (
                <span className={pointTypeColors[record.type]}>
                    {pointTypeLabels[record.type]}
                </span>
            ),
        },
        {
            key: 'amount',
            header: '分值',
            render: (record) => (
                <span
                    className={`font-medium ${record.type === 'earn' ? 'text-success' : 'text-danger'}`}>
                    {record.type === 'earn' ? '+' : '-'}
                    {record.amount}
                </span>
            ),
        },
        {
            key: 'reason',
            header: '原因',
            render: (record) => (
                <span className="text-gray-700">{record.reason}</span>
            ),
        },
        {
            key: 'ruleName',
            header: '规则',
            render: (record) => (
                <span className="text-gray-500">{record.ruleName ?? '-'}</span>
            ),
        },
    ]

    return (
        <div className="card overflow-hidden p-0!">
            <DataTable<PointRecord>
                data={pagedRecords}
                columns={columns}
                emptyText="暂无积分记录"
                pagination={{
                    current: page,
                    total: records.length,
                    onChange: setPage,
                }}
            />
        </div>
    )
}
