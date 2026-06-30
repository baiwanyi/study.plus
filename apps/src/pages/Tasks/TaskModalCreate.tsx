'use client'

import { useState } from 'react'
import { tasksApi, optionsAPI } from '@apps/utils/api'
import { taskTypeLabels } from '@apps/utils/client'
import { Modal } from '@components/Modal'
import { Tabs } from '@components/Tabs'
import type { TaskType } from '@shared/types'

interface TaskModalCreateProps {
    open: boolean
    onCancel: () => void
    onConfirm: (title: string, type: TaskType) => void
}

export function TaskModalCreate({
    open,
    onCancel,
    onConfirm,
}: TaskModalCreateProps) {
    const [title, setTitle] = useState('')
    const [type, setType] = useState<TaskType>('composition')
    const [isAICreateTitle, setIsAICreateTitle] = useState(false)
    const [error, setError] = useState('')

    const handleAiCreateTitle = async () => {
        setIsAICreateTitle(true)
        setError('')
        try {
            const systemData = (await optionsAPI.get('system')) as {
                grade?: number
            }
            const grade = systemData?.grade ?? 1
            const res = await tasksApi.aiGenerateTitle(type, grade)
            setTitle(res.title)
        } catch {
            setError('AI 生成题目失败，请稍后重试')
        } finally {
            setIsAICreateTitle(false)
        }
    }

    const resetState = () => {
        setTitle('')
        setType('composition')
        setError('')
    }

    const handleSave = () => {
        const trimmed = title.trim()
        if (!trimmed) {
            setError('请输入作业题目')
            return
        }
        onConfirm(trimmed, type)
        // 状态重置交由 handleClose 处理，避免 onConfirm 异步操作时表单被提前清空
    }

    const handleClose = () => {
        resetState()
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
                    tabs={Object.entries(taskTypeLabels)
                        .filter(([val]) => val !== 'notes')
                        .map(([val, label]) => ({
                            key: val as TaskType,
                            label,
                        }))}
                    active={type}
                    onChange={(v) => {
                        setType(v)
                        if (error) setError('')
                    }}
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
                        className={`regular-text${error ? ' border-red-500' : ''}`}
                        value={title}
                        onChange={(e) => {
                            setTitle(e.target.value)
                            if (error) setError('')
                        }}
                        placeholder="请输入作业题目"
                        rows={3}
                        maxLength={200}
                    />
                    {error && (
                        <p className="text-red-500 text-sm mt-1">{error}</p>
                    )}
                </div>
            </div>
        </Modal>
    )
}
