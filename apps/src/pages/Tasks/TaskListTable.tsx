'use client'

import { BookOpen } from 'lucide-react'
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

const TRUNCATE_LENGTH = 16

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
                <button
                    onClick={() => isAdminRole && onEdit(task)}
                    className={`font-medium text-headline truncate max-w-75 ${isAdminRole ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}
                    title={task.title}>
                    {task.title.length > TRUNCATE_LENGTH
                        ? `${task.title.slice(0, TRUNCATE_LENGTH)}...`
                        : task.title}
                </button>
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
            key: 'aiComment',
            header: '评语',
            render: (task) =>
                task.aiComment ? (
                    task.aiComment.length > TRUNCATE_LENGTH ? (
                        task.aiComment.slice(0, TRUNCATE_LENGTH) + '...'
                    ) : (
                        task.aiComment
                    )
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
            key: 'gradedAt',
            header: '评分时间',
            render: (task) => (
                <span className="text-gray-600 text-xs">
                    {formatDate(task.gradedAt)}
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
    ], [isAdminRole, onEdit, onEditContent, onShare, onDelete])

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
                    <button onClick={onAddBookNote} className="btn btn-outline">
                        <BookOpen className="w-4 h-4 mr-1" />
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
