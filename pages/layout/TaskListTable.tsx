import { useState, useEffect, useMemo } from 'react'
import type { Task } from '@apps/lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
    taskStatusLabels,
    taskStatusColors,
    defaultGradeColors,
    formatDate,
    paginate,
    isAdmin,
    pointColors,
    pointSymbol,
} from '@apps/lib/utils'
import { DataTable, type Column } from '@components/DataTable'

export interface ListTaskProps {
    tasks: Task[]
    onEdit: (task: Task) => void
    onEditContent: (task: Task) => void
    onScore: (task: Task) => void
    onDelete: (id: number) => void
    onAdd: () => void
}

export default function ListTask({
    tasks,
    onEdit,
    onEditContent,
    onScore,
    onDelete,
    onAdd,
}: ListTaskProps) {
    const [page, setPage] = useState(1)
    const isAdminRole = isAdmin()
    const pagedTasks = useMemo(() => paginate(tasks, page), [tasks, page])

    useEffect(() => setPage(1), [tasks.length])

    const taskColumns: Column<Task>[] = [
        {
            key: 'title',
            header: '题目',
            render: (task) => (
                <button
                    onClick={() => isAdminRole && onEdit(task)}
                    className={`font-medium text-headline truncate max-w-75 ${isAdminRole ? 'hover:text-primary cursor-pointer' : 'cursor-default'}`}
                    title={task.title}>
                    {task.title.length > 16
                        ? `${task.title.slice(0, 16)}...`
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
                task.aiComment || <span className="text-gray-400">-</span>,
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
                        className="btn-outline btn-sm">
                        编辑
                    </button>
                    {isAdminRole && (
                        <>
                            <button
                                onClick={() => onScore(task)}
                                className="btn-primary btn-sm">
                                AI评分
                            </button>
                            <button
                                onClick={() => onDelete(task.id)}
                                className="btn-danger btn-sm">
                                删除
                            </button>
                        </>
                    )}
                </span>
            ),
        },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2>作业管理</h2>
                <button onClick={onAdd} className="btn-primary">
                    添加作业
                </button>
            </div>

            <div className="card overflow-hidden p-0!">
                <DataTable<Task>
                    data={pagedTasks}
                    columns={taskColumns}
                    pagination={{
                        current: page,
                        total: tasks.length,
                        onChange: setPage,
                    }}
                    emptyText="暂无作业记录"
                />
            </div>
        </div>
    )
}
