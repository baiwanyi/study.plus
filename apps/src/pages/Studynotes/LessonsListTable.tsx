'use client'

import { useState, useMemo } from 'react'
import { CheckCircle2, Lock, Share2 } from 'lucide-react'
import { isAdmin, paginate, getPageSize } from '@apps/utils/client'
import { DataTable } from '@components/DataTable'
import { Loading } from '@components/Loading'
import { studynotesSubjectLabels, formatDate } from '@shared/utils'
import type { Column } from '@components/DataTable'
import type { StudyLessonWithStatus } from '@shared/types'
import type { FC } from 'react'

interface LessonsListTableProps {
    loading: boolean
    hasError: boolean
    lessons: StudyLessonWithStatus[]
    onEdit: (lesson: StudyLessonWithStatus) => void
    onPreview: (lesson: StudyLessonWithStatus) => void
    onReflection: (lesson: StudyLessonWithStatus) => void
    onQuiz: (lesson: StudyLessonWithStatus) => void
    onShare: (lesson: StudyLessonWithStatus) => void
    onDelete: (lesson: StudyLessonWithStatus) => void
}

const SUBJECT_COLORS: Record<string, string> = {
    math: 'bg-blue-100 text-blue-800',
    chinese: 'bg-red-100 text-red-800',
    english: 'bg-yellow-100 text-yellow-800',
    science: 'bg-green-100 text-green-800',
    custom: 'bg-purple-100 text-purple-800',
}

function renderPreviewStatus(lesson: StudyLessonWithStatus) {
    if (!lesson.previewDone) {
        return <span className="text-xs text-gray-600">未开始</span>
    }
    return (
        <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 shrink-0 text-green-600" />
            <span className="text-xs text-green-600">已预习</span>
            {lesson.previewScore != null && (
                <span className="text-xs text-gray-500">
                    （{lesson.previewScore}分）
                </span>
            )}
        </span>
    )
}

function renderReflectionStatus(lesson: StudyLessonWithStatus) {
    if (lesson.studynoteId == null) {
        return <span className="text-xs text-gray-600">未开始</span>
    }
    return (
        <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 shrink-0 text-green-600" />
            <span className="text-xs text-green-600">已写心得</span>
            {lesson.studynoteScore != null && (
                <span className="text-xs text-gray-500">
                    （{lesson.studynoteScore}分）
                </span>
            )}
        </span>
    )
}

function renderQuizStatus(lesson: StudyLessonWithStatus) {
    if (lesson.quizScore == null) {
        return <span className="text-xs text-gray-600">-</span>
    }
    return (
        <span className="font-semibold text-base text-amber-600">
            {lesson.quizScore}
        </span>
    )
}

export const LessonsListTable: FC<LessonsListTableProps> = ({
    loading,
    hasError,
    lessons,
    onEdit,
    onPreview,
    onReflection,
    onQuiz,
    onShare,
    onDelete,
}) => {
    const showAdminActions = isAdmin()
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()
    // 钳制页码到有效范围，避免数据变化后停留在不存在的页导致空白
    const totalPages = Math.max(1, Math.ceil(lessons.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pagedLessons = useMemo(
        () => paginate(lessons, currentPage, pageSize),
        [lessons, currentPage, pageSize],
    )
    const pagination = useMemo(
        () => ({
            current: currentPage,
            total: lessons.length,
            onChange: setPage,
        }),
        [currentPage, lessons.length, setPage],
    )

    const columns: Column<StudyLessonWithStatus>[] = [
        {
            key: 'subject',
            header: '学科',
            render: (record) => (
                <span
                    className={`badge ${
                        SUBJECT_COLORS[record.subject] ||
                        'bg-gray-100 text-gray-800'
                    }`}>
                    {studynotesSubjectLabels[record.subject] || record.subject}
                </span>
            ),
        },
        {
            key: 'topic',
            header: '课程名称',
            render: (record) => (
                <button
                    onClick={() => onEdit(record)}
                    className="text-sm font-medium text-primary hover:underline">
                    {record.topic || '-'}
                </button>
            ),
        },
        {
            key: 'preview',
            header: '预习',
            render: (record) => renderPreviewStatus(record),
        },
        {
            key: 'reflection',
            header: '心得',
            render: (record) => renderReflectionStatus(record),
        },
        {
            key: 'quiz',
            header: '测验',
            render: (record) => renderQuizStatus(record),
        },
        {
            key: 'createdAt',
            header: '日期',
            render: (record) => (
                <span className="text-xs text-gray-600">
                    {formatDate(record.createdAt).split(' ')[0]}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '操作',
            render: (record) => {
                const canQuiz =
                    record.studynoteId != null &&
                    record.studynoteScore != null &&
                    record.studynoteScore >= 80
                return (
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => onPreview(record)}
                            className="btn btn-outline btn-sm">
                            预习
                        </button>
                        <button
                            onClick={() => onReflection(record)}
                            className="btn btn-outline btn-sm">
                            心得
                        </button>
                        <button
                            onClick={() => onQuiz(record)}
                            disabled={!canQuiz}
                            title={
                                canQuiz
                                    ? '开始测验'
                                    : '心得评估达 80 分后可开始测验'
                            }
                            className="btn btn-outline btn-sm">
                            {!canQuiz && <Lock className="size-3" />}
                            测验
                        </button>
                        {record.studynoteId != null && (
                            <button
                                onClick={() => onShare(record)}
                                className="btn btn-outline btn-sm">
                                <Share2 className="size-3" />
                                分享
                            </button>
                        )}
                        {showAdminActions && (
                            <button
                                onClick={() => onDelete(record)}
                                className="btn btn-danger btn-sm">
                                删除
                            </button>
                        )}
                    </div>
                )
            },
        },
    ]

    if (loading) {
        return <Loading />
    }

    if (hasError) {
        return (
            <div className="text-center text-red-500 py-12">
                加载课程列表失败，请稍后重试
            </div>
        )
    }

    return (
        <div className="card overflow-hidden p-0!">
            <DataTable
                data={pagedLessons}
                columns={columns}
                pagination={pagination}
                emptyText={'还没有课程，点击"添加课程"开始吧'}
            />
        </div>
    )
}
