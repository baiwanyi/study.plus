import type { Task } from '@apps/lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
} from '@apps/lib/utils'
import { DataTable, type Column } from '@apps/components/DataTable'

interface WidgetPendingTasksProps {
    pendingTasks: Task[]
}

const columns: Column<Task>[] = [
    {
        key: 'title',
        header: '名称',
        render: (task) => <span className="font-medium">{task.title}</span>,
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
]

export default function WidgetPendingTasks({
    pendingTasks,
}: WidgetPendingTasksProps) {
    return (
        <div className="card space-y-4">
            <h3>待完成作业</h3>
            <DataTable
                data={pendingTasks}
                columns={columns}
                rowKey="id"
                emptyText="暂无待完成作业"
            />
        </div>
    )
}
