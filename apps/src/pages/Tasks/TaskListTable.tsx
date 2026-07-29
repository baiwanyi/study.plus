'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import {
    taskTypeLabels,
    taskTypeColors,
    taskStatusLabels,
    taskStatusColors,
    defaultGradeColors,
    formatDate,
    paginate,
    getPageSize,
    isAdmin,
    pointColors,
    pointSymbol,
} from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import type { Task } from '@shared/types'

export interface ListTaskProps {
    tasks: Task[]
    onEdit: (task: Task) => void
    onEditContent: (task: Task) => void
    onShare: (task: Task) => void
    onDelete: (id: number) => void
    onAdd: () => void
    onAddBookNote: () => void
}

export function ListTask({
    tasks,
    onEdit,
    onEditContent,
    onShare,
    onDelete,
    onAdd,
    onAddBookNote,
}: ListTaskProps) {
    const [page, setPage] = useState(1)
    const isAdminRole = isAdmin()
    const pageSize = getPageSize()
    const pagedTasks = useMemo(
        () => paginate(tasks, page, pageSize),
        [tasks, page, pageSize],
    )

    const prevLenRef = useRef(tasks.length)
    useEffect(() => {
        if (tasks.length !== prevLenRef.current) {
            prevLenRef.current = tasks.length
            setPage(1)
        }
    }, [tasks.length])

    const taskColumns = useMemo<Column<Task>[]>(
        () => [
            {
                key: 'title',
                header: '题目',
                render: (task) => (
                    <span
                        onClick={() => isAdminRole && onEdit(task)}
                        className={`font-medium text-headline line-clamp-2 max-w-xs ${isAdminRole ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}>
                        {task.title}
                    </span>
                ),
            },
            {
                key: 'type',
                header: '类型',
                render: (task) => (
                    <span className={`badge ${taskTypeColors[task.type]}`}>
                        {taskTypeLabels[task.type]}
                    </span>
                ),
            },
            {
                key: 'grade',
                header: '评分等级',
                render: (task) =>
                    task.submission?.grade ? (
                        <span
                            className={`badge ${defaultGradeColors[task.submission.grade]}`}>
                            {task.submission.grade}
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    ),
            },
            {
                key: 'score',
                header: '分数',
                render: (task) => {
                    const raw = task.submission?.aiScore
                    if (raw == null)
                        return <span className="text-gray-400">-</span>
                    let score: number | null = null
                    try {
                        const parsed = JSON.parse(raw)
                        if (typeof parsed.score === 'number')
                            score = parsed.score
                    } catch {
                        /* aiScore 不是 JSON 格式，保持原样显示 */
                    }
                    if (score == null)
                        return <span className="font-mono text-sm">{raw}</span>
                    const color =
                        score >= 90
                            ? 'text-yellow-500'
                            : score >= 80
                              ? 'text-green-600'
                              : 'text-red-500'
                    return (
                        <span
                            className={`font-mono text-sm font-bold ${color}`}>
                            {score}
                        </span>
                    )
                },
            },
            {
                key: 'aiComment',
                header: '评语',
                render: (task) =>
                    task.aiComment ? (
                        <span className="text-sm text-gray-600 line-clamp-2 max-w-xs">
                            {task.aiComment}
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    ),
            },
            {
                key: 'pointsEarned',
                header: '积分',
                render: (task) =>
                    task.pointsEarned !== null ? (
                        <span
                            className={
                                task.pointsEarned >= 0
                                    ? pointColors.earn
                                    : pointColors.deduct
                            }>
                            {task.pointsEarned >= 0
                                ? pointSymbol.earn
                                : pointSymbol.deduct}
                            {Math.abs(task.pointsEarned)}
                        </span>
                    ) : (
                        <span className="text-gray-400">-</span>
                    ),
            },
            {
                key: 'status',
                header: '状态',
                render: (task) => (
                    <span className={taskStatusColors[task.status]}>
                        {taskStatusLabels[task.status]}
                    </span>
                ),
            },
            {
                key: 'submittedAt',
                header: '提交时间',
                render: (task) => (
                    <span className="text-gray-600 text-xs">
                        {formatDate(task.submittedAt)}
                    </span>
                ),
            },
            {
                key: 'actions',
                header: '操作',
                render: (task) => (
                    <span className="space-x-2">
                        <button
                            onClick={() => onEditContent(task)}
                            className="btn btn-outline btn-sm">
                            编辑
                        </button>
                        <button
                            onClick={() => onShare(task)}
                            className="btn btn-outline btn-sm">
                            分享
                        </button>
                        {isAdminRole && (
                            <button
                                onClick={() => onDelete(task.id)}
                                className="btn btn-danger btn-sm">
                                删除
                            </button>
                        )}
                    </span>
                ),
            },
        ],
        [isAdminRole, onEdit, onEditContent, onShare, onDelete],
    )

    const pagination = useMemo(
        () => ({
            current: page,
            total: tasks.length,
            onChange: setPage,
        }),
        [page, tasks.length],
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2>作业管理</h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onAddBookNote}
                        className="btn btn-outline bg-white">
                        添加读书笔记
                    </button>
                    <button onClick={onAdd} className="btn btn-primary">
                        添加作业
                    </button>
                </div>
            </div>

            <div className="card overflow-hidden p-0!">
                <DataTable<Task>
                    data={pagedTasks}
                    columns={taskColumns}
                    pagination={pagination}
                    emptyText="暂无作业记录"
                />
            </div>
        </div>
    )
}
