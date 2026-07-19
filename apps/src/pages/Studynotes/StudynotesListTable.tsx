'use client'

import { useState, useMemo } from 'react'
import { isAdmin, paginate, getPageSize } from '@apps/utils/client'
import { DataTable } from '@components/DataTable'
import { Loading } from '@components/Loading'
import { studynotesSubjectLabels, formatDate } from '@shared/utils'
import type { Column } from '@components/DataTable'
import type { StudynotesItem, StudynotesEvaluation } from '@shared/types'
import type { FC } from 'react'

interface StudynotesListTableProps {
    loading: boolean
    hasError: boolean
    notes: StudynotesItem[]
    onCardClick: (id: number) => void
    onShare: (card: StudynotesItem) => void
    onDelete: (id: number) => void
}

const SUBJECT_COLORS: Record<string, string> = {
    math: 'bg-blue-100 text-blue-800',
    chinese: 'bg-red-100 text-red-800',
    english: 'bg-yellow-100 text-yellow-800',
    science: 'bg-green-100 text-green-800',
    custom: 'bg-purple-100 text-purple-800',
}

function colorForScore(score: number): string {
    if (score < 80) return 'text-red-600'
    if (score < 90) return 'text-green-600'
    return 'text-amber-500'
}

function renderEvaluation(evaluation: string | null) {
    if (!evaluation) {
        return <span className="text-xs text-gray-600">-</span>
    }
    try {
        const evalData = JSON.parse(evaluation) as StudynotesEvaluation
        const score = evalData.completenessScore
        return (
            <span className={`font-semibold text-base ${colorForScore(score)}`}>
                {score}
            </span>
        )
    } catch {
        return <span className="text-xs text-gray-600">-</span>
    }
}

function renderFollowUpScore(score: number | null | undefined) {
    if (score == null) {
        return <span className="text-xs text-gray-600">-</span>
    }
    return (
        <span className={`font-semibold text-base ${colorForScore(score)}`}>
            {score}
        </span>
    )
}

export const StudynotesListTable: FC<StudynotesListTableProps> = ({
    loading,
    hasError,
    notes,
    onCardClick,
    onShare,
    onDelete,
}) => {
    const showAdminActions = isAdmin()
    const [page, setPage] = useState(1)
    const pageSize = getPageSize()
    // 钳制页码到有效范围，避免数据变化后停留在不存在的页导致空白
    const totalPages = Math.max(1, Math.ceil(notes.length / pageSize))
    const currentPage = Math.min(page, totalPages)
    const pagedCards = useMemo(
        () => paginate(notes, currentPage, pageSize),
        [notes, currentPage, pageSize],
    )
    const pagination = useMemo(
        () => ({
            current: currentPage,
            total: notes.length,
            onChange: setPage,
        }),
        [currentPage, notes.length, setPage],
    )

    const columns: Column<StudynotesItem>[] = [
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
            header: '课题',
            render: (record) => (
                <span className="text-sm text-gray-700">
                    {record.topic || '-'}
                </span>
            ),
        },
        {
            key: 'summary',
            header: '一句话概括',
            render: (record) => (
                <span className="text-sm text-gray-600 line-clamp-2 max-w-xs">
                    {record.summary}
                </span>
            ),
        },
        {
            key: 'evaluation',
            header: '心得评分',
            render: (record) => renderEvaluation(record.evaluation),
        },
        {
            key: 'followUpScore',
            header: '追问评分',
            render: (record) => renderFollowUpScore(record.followUpScore),
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
            render: (record) => (
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => onCardClick(record.id)}
                        className="btn btn-outline btn-sm">
                        编辑
                    </button>
                    <button
                        onClick={() => onShare(record)}
                        className="btn btn-outline btn-sm">
                        分享
                    </button>
                    {showAdminActions && (
                        <button
                            onClick={() => onDelete(record.id)}
                            className="btn btn-danger btn-sm">
                            删除
                        </button>
                    )}
                </div>
            ),
        },
    ]

    if (loading) {
        return <Loading />
    }

    if (hasError) {
        return (
            <div className="text-center text-red-500 py-12">
                加载学习心得失败，请稍后重试
            </div>
        )
    }

    return (
        <div className="card overflow-hidden p-0!">
            <DataTable
                data={pagedCards}
                columns={columns}
                pagination={pagination}
                emptyText={'还没有学习心得记录，点击"添加心得"开始吧'}
            />
        </div>
    )
}
