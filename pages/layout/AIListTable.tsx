import { useState, useMemo, useEffect } from 'react'
import { DataTable, type Column } from '@components/DataTable'
import type { AIUsageLog } from '@apps/lib/types'
import { formatDate, formatNumber, paginate, taskAILabels } from '@apps/lib/utils'

interface AIListTableProps {
    logs: AIUsageLog[]
}

export default function AIListTable({ logs }: AIListTableProps) {
    const [page, setPage] = useState(1)

    // Reset page when data changes to avoid out-of-range pages
    useEffect(() => {
        setPage(1)
    }, [logs.length])

    const pagedLogs = useMemo(() => paginate(logs, page), [logs, page])

    const AIColumns: Column<AIUsageLog>[] = [
        {
            key: 'project',
            header: '使用项目',
            render: (log) => (
                <span className="font-medium text-gray-900">
                    {taskAILabels[log.project as keyof typeof taskAILabels] || log.project}
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
