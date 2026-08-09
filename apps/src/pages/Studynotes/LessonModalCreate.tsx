'use client'

import { useState } from 'react'
import { Modal } from '@components/Modal'
import { studynotesSubjectLabels, studynotesSubjectValues } from '@shared/utils'
import type { FC } from 'react'

interface LessonModalCreateProps {
    open: boolean
    onCancel: () => void
    onConfirm: (subject: string, topic: string) => void
}

export const LessonModalCreate: FC<LessonModalCreateProps> = ({
    open,
    onCancel,
    onConfirm,
}) => {
    const [subject, setSubject] = useState('math')
    const [topic, setTopic] = useState('')
    const [error, setError] = useState('')

    const resetState = () => {
        setSubject('math')
        setTopic('')
        setError('')
    }

    const handleSave = () => {
        const trimmed = topic.trim()
        if (!trimmed) {
            setError('请输入课程名称')
            return
        }
        onConfirm(subject, trimmed)
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
            title="添加课程">
            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        学科
                    </label>
                    <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                        {studynotesSubjectValues.map((s) => (
                            <option key={s} value={s}>
                                {studynotesSubjectLabels[s]}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        课程名称
                    </label>
                    <input
                        type="text"
                        value={topic}
                        onChange={(e) => {
                            setTopic(e.target.value)
                            if (error) setError('')
                        }}
                        placeholder="如：分数的约分"
                        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                            error ? 'border-red-500' : 'border-gray-300'
                        }`}
                    />
                    {error && (
                        <p className="text-red-500 text-xs mt-1">{error}</p>
                    )}
                </div>
            </div>
        </Modal>
    )
}
