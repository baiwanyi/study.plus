'use client'

import { useEffect, useRef, useState } from 'react'
import { Modal } from '@components/Modal'
import { studynotesSubjectLabels, studynotesSubjectValues } from '@shared/utils'
import type { StudyLesson } from '@shared/types'
import type { FC } from 'react'

interface LessonModalEditorProps {
    open: boolean
    lesson: StudyLesson | null
    onCancel: () => void
    onConfirm: (subject: string, topic: string) => void
    isLoading?: boolean
}

export const LessonModalEditor: FC<LessonModalEditorProps> = ({
    open,
    lesson,
    onCancel,
    onConfirm,
    isLoading,
}) => {
    const [subject, setSubject] = useState('math')
    const [topic, setTopic] = useState('')
    const [error, setError] = useState('')

    // 仅在弹窗由关闭切换到打开时回填一次：
    // 编辑模式回填 lesson 值，创建模式重置为默认值。
    // 用 prevOpen 记录上一帧 open，避免 lesson 引用变化（如父组件
    // refetch 后传入新对象）导致重复回填、覆盖用户正在输入的草稿。
    const prevOpen = useRef(false)
    useEffect(() => {
        if (open && !prevOpen.current) {
            if (lesson) {
                setSubject(lesson.subject)
                setTopic(lesson.topic)
            } else {
                setSubject('math')
                setTopic('')
            }
            setError('')
        }
        prevOpen.current = open
    }, [open, lesson])

    const handleSave = () => {
        const trimmed = topic.trim()
        if (!trimmed) {
            setError('请输入课程名称')
            return
        }
        onConfirm(subject, trimmed)
    }

    const isEdit = lesson != null

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            onConfirm={handleSave}
            isLoading={isLoading}
            confirmLabel={isEdit ? '保存' : '创建'}
            title={isEdit ? '编辑课程' : '添加课程'}>
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
