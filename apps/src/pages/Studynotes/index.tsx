'use client'

import { useState, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { studynotesApi } from '@apps/utils/api'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { StudynotesModalEditor } from './StudynotesModalEditor'
import { StudynotesListTable } from './StudynotesListTable'
import { StudynotesModalShare } from './StudynotesModalShare'
import { StudynotesSubjectFilter } from './StudynotesSubjectFilter'
import { useStudynotes } from './hooks/useStudynotes'
import type { StudynotesItem } from '@shared/types'

export const Studynotes: FC = () => {
    const { showSnackbar } = useSnackbar()
    const [searchParams, setSearchParams] = useSearchParams()
    const subject = searchParams.get('subject') || ''
    const {
        data: notes = [],
        isLoading: loading,
        isError: hasError,
        refetch,
    } = useStudynotes(subject)

    const [modalNoteId, setModalNoteId] = useState<number | null | undefined>(
        undefined,
    )
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [shareNote, setShareNote] = useState<StudynotesItem | null>(null)

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
                    onClick={() => setModalNoteId(null)}
                    className="btn btn-primary">
                    添加心得
                </button>
            </div>

            <StudynotesSubjectFilter
                subject={subject}
                onSubjectChange={handleSubjectChange}
            />

            <StudynotesListTable
                loading={loading}
                hasError={hasError}
                notes={notes}
                onCardClick={(id) => setModalNoteId(id)}
                onShare={(card) => setShareNote(card)}
                onDelete={(id) => setDeleteTargetId(id)}
            />

            <StudynotesModalEditor
                open={modalNoteId !== undefined}
                cardId={modalNoteId ?? null}
                onClose={() => {
                    setModalNoteId(undefined)
                    refetch()
                }}
                onSaved={() => refetch()}
            />

            <StudynotesModalShare
                open={shareNote != null}
                card={shareNote}
                onCancel={() => setShareNote(null)}
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
