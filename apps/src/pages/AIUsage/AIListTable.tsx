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

interface AIUsageDisplayRow {
    id: string
    project: string
    taskTitle: string | null
    taskId: number | null
    count: number
    promptTokens: number
    completionTokens: number
    totalTokens: number
    createdAt: string
}

interface AIListTableProps {
    logs: AIUsageLog[]
}

export function AIListTable({ logs }: AIListTableProps) {
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()

    // Group records by (project, taskTitle) and merge duplicates into one row
    const displayRows = useMemo(() => {
        const grouped = new Map<string, AIUsageLog[]>()

        for (const log of logs) {
            const key = `${log.project}|${log.taskTitle ?? ''}`
            const group = grouped.get(key)
            if (group) {
                group.push(log)
            } else {
                grouped.set(key, [log])
            }
        }

        const rows: AIUsageDisplayRow[] = []
        for (const group of grouped.values()) {
            const first = group[0]
            const last = group[group.length - 1]
            const isMerged = group.length > 1
            rows.push({
                id: isMerged ? `merged-${first.project}|${first.taskTitle}` : `individual-${first.id}`,
                project: first.project,
                taskTitle: first.taskTitle,
                taskId: isMerged ? null : first.taskId,
                count: group.length,
                promptTokens: group.reduce((sum, l) => sum + l.promptTokens, 0),
                completionTokens: group.reduce(
                    (sum, l) => sum + l.completionTokens,
                    0,
                ),
                totalTokens: group.reduce((sum, l) => sum + l.totalTokens, 0),
                createdAt: last.createdAt,
            })
        }

        return rows
    }, [logs])

    // Reset page when data length changes to avoid out-of-range pages
    const prevLenRef = useRef(displayRows.length)
    useEffect(() => {
        if (displayRows.length !== prevLenRef.current) {
            prevLenRef.current = displayRows.length
            setPage(1)
        }
    }, [displayRows.length])

    const pagedRows = useMemo(
        () => paginate(displayRows, page, pageSize),
        [displayRows, page, pageSize],
    )

    return (
        <div className="card">
            <DataTable<AIUsageDisplayRow>
                data={pagedRows}
                columns={AIColumns}
                rowKey="id"
                pagination={{
                    current: page,
                    total: displayRows.length,
                    onChange: setPage,
                }}
            />
        </div>
    )
}

const AIColumns: Column<AIUsageDisplayRow>[] = [
    {
        key: 'project',
        header: '使用项目',
        render: (row) => (
            <span className="font-medium text-gray-900">
                {taskAILabels[row.project as keyof typeof taskAILabels] ||
                    row.project}
            </span>
        ),
    },
    {
        key: 'taskTitle',
        header: '作业名称',
        render: (row) => (
            <span className="text-gray-600">{row.taskTitle || '-'}</span>
        ),
    },
    {
        key: 'count',
        header: '调用次数',
        render: (row) => (
            <span className="font-medium text-gray-700">{row.count}</span>
        ),
    },
    {
        key: 'taskId',
        header: '作业编号',
        render: (row) => (
            <span className="text-gray-600">{row.taskId ?? '-'}</span>
        ),
    },
    {
        key: 'promptTokens',
        header: '输入 Token',
        render: (row) => (
            <span className="text-gray-600">
                {formatNumber(row.promptTokens)}
            </span>
        ),
    },
    {
        key: 'completionTokens',
        header: '输出 Token',
        render: (row) => (
            <span className="text-gray-600">
                {formatNumber(row.completionTokens)}
            </span>
        ),
    },
    {
        key: 'totalTokens',
        header: '总 Token',
        render: (row) => (
            <span className="font-medium text-primary">
                {formatNumber(row.totalTokens)}
            </span>
        ),
    },
    {
        key: 'createdAt',
        header: '使用时间',
        render: (row) => (
            <span className="text-gray-500 text-xs">
                {formatDate(row.createdAt)}
            </span>
        ),
    },
]
