import { useState } from 'react'
import type { TaskType } from '@apps/lib/types'
import { taskTypeLabels } from '@apps/lib/utils'
import { tasksApi, optionsAPI } from '@apps/lib/api'
import Modal from '@apps/components/Modal'
import Tabs from '@apps/components/Tabs'

interface TaskModalCreateProps {
    open: boolean
    onCancel: () => void
    onConfirm: (title: string, type: TaskType) => void
}

export default function TaskModalCreate({
    open,
    onCancel,
    onConfirm,
}: TaskModalCreateProps) {
    const [title, setTitle] = useState('')
    const [type, setType] = useState<TaskType>('composition')
    const [isAICreateTitle, setIsAICreateTitle] = useState(false)

    const handleAiCreateTitle = async () => {
        setIsAICreateTitle(true)
        try {
            const systemData = (await optionsAPI.get('system')) as {
                grade?: number
            }
            const grade = systemData?.grade ?? 1
            const res = await tasksApi.aiGenerateTitle(type, grade)
            setTitle(res.title)
        } catch {
            // silently fail
        } finally {
            setIsAICreateTitle(false)
        }
    }

    const handleSave = () => {
        onConfirm(title.trim(), type)
    }

    const handleClose = () => {
        setTitle('')
        setType('composition')
        onCancel()
    }

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            onConfirm={handleSave}
            confirmLabel="创建"
            title="新建作业">
            <div className="space-y-4">
                <Tabs<TaskType>
                    tabs={Object.entries(taskTypeLabels).map(
                        ([val, label]) => ({
                            key: val as TaskType,
                            label,
                        }),
                    )}
                    active={type}
                    onChange={setType}
                    background="gray"
                    activeClassName="bg-white text-headline"
                />

                <div className="space-y-1">
                    <div className="flex justify-between items-center">
                        <label className="label">作业题目</label>
                        <button
                            onClick={handleAiCreateTitle}
                            disabled={isAICreateTitle}
                            className="btn btn-outline btn-sm">
                            {isAICreateTitle ? '题目生成中...' : '生成题目'}
                        </button>
                    </div>
                    <textarea
                        className="regular-text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="请输入作业题目"
                        rows={3}
                    />
                </div>
            </div>
        </Modal>
    )
}
