import type { Task } from '@apps/lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
    taskStatusLabels,
} from '@apps/lib/utils'
import { DataTable, type Column } from '@apps/components/DataTable'

interface WidgetPendingTasksProps {
    pendingTasks: Task[]
}

const columns: Column<Task>[] = [
    {
        key: 'title',
        header: '名称',
        render: (task) => (
            <span className="font-medium text-gray-900">{task.title}</span>
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
        key: 'status',
        header: '状态',
        render: (task) => (
            <span className="badge-pending">
                {taskStatusLabels[task.status]}
            </span>
        ),
    },
]

export default function WidgetPendingTasks({
    pendingTasks,
}: WidgetPendingTasksProps) {
    return (
        <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                待完成作业
            </h3>
            <DataTable
                data={pendingTasks}
                columns={columns}
                rowKey="id"
                emptyText="暂无待完成作业"
            />
        </div>
    )
}
