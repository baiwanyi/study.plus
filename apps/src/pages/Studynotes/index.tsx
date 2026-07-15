'use client'

import { useState, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { studynotesApi } from '@apps/utils/api'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { StudynotesModalEditor } from './StudynotesModalEditor'
import { StudynotesCardList } from './StudynotesListTable'
import { StudynotesModalShare } from './StudynotesModalShare'
import { StudynotesSubjectFilter } from './StudynotesSubjectFilter'
import { useStudynotesCards } from './hooks/useStudynotesCards'
import type { StudynotesCard } from '@shared/types'

export const Studynotes: FC = () => {
    const { showSnackbar } = useSnackbar()
    const [searchParams, setSearchParams] = useSearchParams()
    const subject = searchParams.get('subject') || ''
    const {
        data: cards = [],
        isLoading: loading,
        isError: hasError,
        refetch,
    } = useStudynotesCards(subject)

    const [modalCardId, setModalCardId] = useState<number | null | undefined>(
        undefined,
    )
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [shareCard, setShareCard] = useState<StudynotesCard | null>(null)

    const handleSubjectChange = (value: string) => {
        if (value) {
            setSearchParams({ subject: value })
        } else {
            setSearchParams({})
        }
    }

    const handleDelete = async () => {
        if (deleteTargetId == null) return
        setDeleting(true)
        try {
            await studynotesApi.delete(deleteTargetId)
            showSnackbar('删除成功')
            setDeleteTargetId(null)
            refetch()
        } catch {
            showSnackbar('删除失败，请重试', 'error')
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2>学习心得</h2>
                <button
                    onClick={() => setModalCardId(null)}
                    className="btn btn-primary">
                    添加心得
                </button>
            </div>

            <StudynotesSubjectFilter
                subject={subject}
                onSubjectChange={handleSubjectChange}
            />

            <StudynotesCardList
                loading={loading}
                hasError={hasError}
                cards={cards}
                onCardClick={(id) => setModalCardId(id)}
                onShare={(card) => setShareCard(card)}
                onDelete={(id) => setDeleteTargetId(id)}
            />

            <StudynotesModalEditor
                open={modalCardId !== undefined}
                cardId={modalCardId ?? null}
                onClose={() => {
                    setModalCardId(undefined)
                    refetch()
                }}
                onSaved={() => refetch()}
            />

            <StudynotesModalShare
                open={shareCard != null}
                card={shareCard}
                onCancel={() => setShareCard(null)}
            />

            <Modal
                open={deleteTargetId != null}
                onCancel={() => setDeleteTargetId(null)}
                title="确认删除"
                size="sm"
                danger
                confirmLabel="确认删除"
                onConfirm={handleDelete}
                isLoading={deleting}>
                <p className="text-sm text-gray-600">
                    确定要删除这张学习心得吗？此操作不可恢复。
                </p>
            </Modal>
        </div>
    )
}
