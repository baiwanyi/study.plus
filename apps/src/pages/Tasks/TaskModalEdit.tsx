import { useState, useEffect } from 'react'
import type { Task, TaskType } from '@shared/types'
import { taskTypeLabels } from '@apps/utils'
import Modal from '@components/Modal'

interface TaskModalEditProps {
    open: boolean
    task: Task | null
    onCancel: () => void
    onConfirm: (title: string, type: TaskType) => void
    isLoading: boolean
}

export default function TaskModalEdit({
    open,
    task,
    onCancel,
    onConfirm,
    isLoading,
}: TaskModalEditProps) {
    const [title, setTitle] = useState('')
    const [type, setType] = useState<TaskType>('composition')

    useEffect(() => {
        if (task) {
            setTitle(task.title)
            setType(task.type)
        }
    }, [task])

    const handleSave = () => {
        onConfirm(title.trim(), type)
    }

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onConfirm={handleSave}
            isLoading={isLoading}
            confirmLabel="保存"
            title="编辑作业">
            <div className="space-y-1">
                <label className="label">作业名称</label>
                <textarea
                    className="regular-text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="请输入作业名称"
                    rows={3}
                />
            </div>
            <div className="space-y-1">
                <label className="label">作业类型</label>
                <select
                    className="regular-text"
                    value={type}
                    onChange={(e) => setType(e.target.value as TaskType)}>
                    {Object.entries(taskTypeLabels).map(([val, label]) => (
                        <option key={val} value={val}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
        </Modal>
    )
}
