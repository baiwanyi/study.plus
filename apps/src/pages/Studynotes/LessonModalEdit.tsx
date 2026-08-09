'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@components/Modal'
import { studynotesSubjectLabels, studynotesSubjectValues } from '@shared/utils'
import type { StudyLesson } from '@shared/types'
import type { FC } from 'react'

interface LessonModalEditProps {
    open: boolean
    lesson: StudyLesson | null
    onCancel: () => void
    onConfirm: (subject: string, topic: string) => void
    isLoading: boolean
}

export const LessonModalEdit: FC<LessonModalEditProps> = ({
    open,
    lesson,
    onCancel,
    onConfirm,
    isLoading,
}) => {
    const [subject, setSubject] = useState('math')
    const [topic, setTopic] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        if (lesson) {
            setSubject(lesson.subject)
            setTopic(lesson.topic)
            setError('')
        }
    }, [lesson])

    const handleSave = () => {
        const trimmed = topic.trim()
        if (!trimmed) {
            setError('请输入课程名称')
            return
        }
        onConfirm(subject, trimmed)
    }

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onConfirm={handleSave}
            isLoading={isLoading}
            confirmLabel="保存"
            title="编辑课程">
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
