'use client'

import { Check, Eye, SquarePen, Trash2, X } from 'lucide-react'
import { useMemo } from 'react'

import { DataTable } from '@components/DataTable'
import { formatDate, isAdmin } from '@apps/utils/client'
import { parseContent } from '@shared/weekly'
import type { WeeklyReport } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'

interface ColumnItem {
    key: string
    header: string
    render?: (record: WeeklyReport, index: number) => React.ReactNode
}

interface WeeklyListTableProps {
    reports: WeeklyReport[]
    onView: (report: WeeklyReport) => void
    onEdit: (report: WeeklyReport) => void
    onDelete: (id: number) => void
}

/** 勾/叉图标 */
const checkIcon = (filled: boolean) =>
    filled ? (
        <Check className="size-4 text-success inline" />
    ) : (
        <X className="size-4 text-danger inline" />
    )

/** 判断字段是否已填写 */
const isFilled = (val: string | undefined) =>
    val !== undefined && val.trim().length > 0

export function WeeklyListTable({
    reports,
    onView,
    onEdit,
    onDelete,
}: WeeklyListTableProps) {
    // 预解析所有报告的 content，避免每列渲染时重复调用 parseContent
    const parsedCache = useMemo(() => {
        const cache = new Map<number, WeeklyReportContent>()
        for (const report of reports) {
            cache.set(report.id, parseContent(report.content))
        }
        return cache
    }, [reports])

    const parseContentLocal = (record: WeeklyReport): WeeklyReportContent =>
        parsedCache.get(record.id)!

    const columns: ColumnItem[] = useMemo(
        () => [
            {
                key: 'week',
                header: '周次',
                render: (record: WeeklyReport) =>
                    `${record.year} · 第${record.weekNumber}周`,
            },
            {
                key: 'learned',
                header: '学到的东西',
                render: (record: WeeklyReport) =>
                    checkIcon(isFilled(parseContentLocal(record).learned)),
            },
            {
                key: 'difficulties',
                header: '遇到的困难',
                render: (record: WeeklyReport) =>
                    checkIcon(isFilled(parseContentLocal(record).difficulties)),
            },
            {
                key: 'weakPoints',
                header: '未掌握知识点',
                render: (record: WeeklyReport) =>
                    checkIcon(isFilled(parseContentLocal(record).weakPoints)),
            },
            {
                key: 'achievement',
                header: '成就感故事',
                render: (record: WeeklyReport) =>
                    checkIcon(isFilled(parseContentLocal(record).achievement)),
            },
            {
                key: 'smartGoal',
                header: '下周规划',
                render: (record: WeeklyReport) => {
                    const c = parseContentLocal(record)
                    const hasGoal =
                        isFilled(c.smartGoalS) ||
                        isFilled(c.smartGoalM) ||
                        isFilled(c.smartGoalA) ||
                        isFilled(c.smartGoalR) ||
                        isFilled(c.smartGoalT)
                    return checkIcon(hasGoal)
                },
            },
            {
                key: 'analysis',
                header: 'AI 分析',
                render: (record: WeeklyReport) => {
                    const hasAnalysis = !!record.analysis
                    return (
                        <span
                            className={
                                hasAnalysis ? 'text-success' : 'text-gray-300'
                            }>
                            {checkIcon(hasAnalysis)}
                        </span>
                    )
                },
            },
            {
                key: 'createdAt',
                header: '创建时间',
                render: (record: WeeklyReport) => formatDate(record.createdAt),
            },
            {
                key: 'actions',
                header: '操作',
                render: (record: WeeklyReport) => (
                    <div className="flex gap-1 justify-end">
                        <button
                            onClick={() => onView(record)}
                            className="btn btn-outline btn-sm"
                            title="查看">
                            <Eye className="size-4" />
                        </button>
                        <button
                            onClick={() => onEdit(record)}
                            className="btn btn-outline btn-sm"
                            title="编辑">
                            <SquarePen className="size-4" />
                        </button>
                        {isAdmin() && (
                            <button
                                onClick={() => onDelete(record.id)}
                                className="btn btn-outline btn-sm text-danger"
                                title="删除">
                                <Trash2 className="size-4" />
                            </button>
                        )}
                    </div>
                ),
            },
        ],
        [onView, onEdit, onDelete, reports],
    )

    return (
        <div className="card">
            <DataTable
                data={reports}
                columns={columns}
                rowKey="id"
                emptyText="暂无周报，点击上方按钮撰写"
            />
        </div>
    )
}
