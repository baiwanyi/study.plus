'use client'

import { isAdmin } from '@apps/utils/client'
import { DataTable } from '@components/DataTable'
import { Loading } from '@components/Loading'
import { studynotesSubjectLabels, formatDate } from '@shared/utils'
import type { Column } from '@components/DataTable'
import type { StudynotesCard } from '@shared/types'
import type { FC } from 'react'

interface StudynotesCardListProps {
    loading: boolean
    hasError: boolean
    cards: StudynotesCard[]
    onCardClick: (id: number) => void
    onShare: (card: StudynotesCard) => void
    onDelete: (id: number) => void
}

const SUBJECT_COLORS: Record<string, string> = {
    math: 'bg-blue-100 text-blue-800',
    chinese: 'bg-red-100 text-red-800',
    english: 'bg-yellow-100 text-yellow-800',
}

export const StudynotesCardList: FC<StudynotesCardListProps> = ({
    loading,
    hasError,
    cards,
    onCardClick,
    onShare,
    onDelete,
}) => {
    const showAdminActions = isAdmin()

    const columns: Column<StudynotesCard>[] = [
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
            header: '评估',
            render: (record) =>
                record.evaluation ? (
                    <span className="badge text-green-600 bg-green-50">
                        已评估
                    </span>
                ) : (
                    <span className="text-xs text-gray-600">-</span>
                ),
        },
        {
            key: 'followUpCount',
            header: '追问',
            render: (record) => {
                const count = record.followUpCount ?? 0
                return (
                    <span
                        className={`text-xs ${
                            count > 0
                                ? 'text-primary font-medium'
                                : 'text-gray-600'
                        }`}>
                        {count > 0 ? `${count} 次` : '-'}
                    </span>
                )
            },
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
                data={cards}
                columns={columns}
                emptyText={'还没有学习心得记录，点击"添加心得"开始吧'}
            />
        </div>
    )
}
