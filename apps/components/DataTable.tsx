import React from 'react'
import { getPageSize } from '@apps/lib/utils'
export interface Column<T> {
    key: string
    header: React.ReactNode
    render?: (record: T, index: number) => React.ReactNode
}

export interface DataTableProps<T> {
    data: T[]
    columns: Column<T>[]
    pagination?: {
        current: number
        total: number
        onChange: (page: number) => void
    }
    emptyText?: string
    rowKey?: string | ((record: T, index: number) => string)
}

export function DataTable<T extends Record<string, any>>({
    data,
    columns,
    pagination,
    emptyText = '暂无数据',
    rowKey = 'id',
}: DataTableProps<T>) {
    const getRowKey = (record: T, idx: number): string => {
        if (typeof rowKey === 'function') return rowKey(record, idx)
        return String(record[rowKey] ?? idx)
    }

    const pageSize = getPageSize()
    const totalPages = pagination ? Math.ceil(pagination.total / pageSize) : 0
    return (
        <div className="space-y-6">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-gray-200">
                        {columns.map((col, ci) => (
                            <th
                                key={col.key}
                                className={`py-3 px-4 text-gray-500 font-medium ${ci === columns.length - 1 ? 'text-end' : 'text-start'}`}>
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.length === 0 ? (
                        <tr>
                            <td
                                colSpan={columns.length}
                                className="py-8 text-center text-gray-400">
                                {emptyText}
                            </td>
                        </tr>
                    ) : (
                        data.map((record, idx) => (
                            <tr
                                key={getRowKey(record, idx)}
                                className="border-b border-gray-50 hover:bg-gray-50">
                                {columns.map((col, ci) => (
                                    <td
                                        key={col.key}
                                        className={`py-3 px-4 ${ci === columns.length - 1 ? 'text-end' : ''}`}>
                                        {col.render
                                            ? col.render(record, idx)
                                            : (record[col.key] ?? '-')}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {pagination && pagination.total > pageSize && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                    <p className="text-sm text-gray-500">
                        共 {pagination.total} 条，第 {pagination.current}/
                        {totalPages} 页
                    </p>
                    <div className="flex gap-2">
                        <button
                            onClick={() =>
                                pagination.onChange(pagination.current - 1)
                            }
                            disabled={pagination.current <= 1}
                            className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
                            上一页
                        </button>
                        <button
                            onClick={() =>
                                pagination.onChange(pagination.current + 1)
                            }
                            disabled={pagination.current >= totalPages}
                            className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
                            下一页
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
