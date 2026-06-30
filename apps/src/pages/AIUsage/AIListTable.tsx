'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import {
    formatDate,
    formatNumber,
    getPageSize,
    paginate,
    taskAILabels,
} from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import type { AIUsageLog } from '@shared/types'

interface AIListTableProps {
    logs: AIUsageLog[]
}

export function AIListTable({ logs }: AIListTableProps) {
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()

    // Reset page when data length changes to avoid out-of-range pages
    const prevLenRef = useRef(logs.length)
    useEffect(() => {
        if (logs.length !== prevLenRef.current) {
            prevLenRef.current = logs.length
            setPage(1)
        }
    }, [logs.length])

    const pagedLogs = useMemo(
        () => paginate(logs, page, pageSize),
        [logs, page, pageSize],
    )

    return (
        <div className="card">
            <DataTable<AIUsageLog>
                data={pagedLogs}
                columns={AIColumns}
                pagination={{
                    current: page,
                    total: logs.length,
                    onChange: setPage,
                }}
            />
        </div>
    )
}

const AIColumns: Column<AIUsageLog>[] = [
    {
        key: 'project',
        header: '使用项目',
        render: (log) => (
            <span className="font-medium text-gray-900">
                {taskAILabels[log.project as keyof typeof taskAILabels] ||
                    log.project}
            </span>
        ),
    },
    {
        key: 'taskTitle',
        header: '作业名称',
        render: (log) => (
            <span className="text-gray-600">{log.taskTitle || '-'}</span>
        ),
    },
    {
        key: 'taskId',
        header: '作业编号',
        render: (log) => (
            <span className="text-gray-600">{log.taskId ?? '-'}</span>
        ),
    },
    {
        key: 'promptTokens',
        header: '输入 Token',
        render: (log) => (
            <span className="text-gray-600">
                {formatNumber(log.promptTokens)}
            </span>
        ),
    },
    {
        key: 'completionTokens',
        header: '输出 Token',
        render: (log) => (
            <span className="text-gray-600">
                {formatNumber(log.completionTokens)}
            </span>
        ),
    },
    {
        key: 'totalTokens',
        header: '总 Token',
        render: (log) => (
            <span className="font-medium text-primary">
                {formatNumber(log.totalTokens)}
            </span>
        ),
    },
    {
        key: 'createdAt',
        header: '使用时间',
        render: (log) => (
            <span className="text-gray-500 text-xs">
                {formatDate(log.createdAt)}
            </span>
        ),
    },
]
