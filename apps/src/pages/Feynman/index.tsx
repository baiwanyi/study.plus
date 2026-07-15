'use client'

import { useState, type FC } from 'react'
import { useSearchParams } from 'react-router-dom'
import { feynmanApi } from '@apps/utils/api'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { FeynmanEditorModal } from './FeynmanEditor'
import { FeynmanCardList } from './FeynmanListTable'
import { FeynmanModalShare } from './FeynmanModalShare'
import { FeynmanSubjectFilter } from './FeynmanSubjectFilter'
import { useFeynmanCards } from './hooks/useFeynmanCards'
import type { FeynmanCard } from '@shared/types'

export const Feynman: FC = () => {
    const { showSnackbar } = useSnackbar()
    const [searchParams, setSearchParams] = useSearchParams()
    const subject = searchParams.get('subject') || ''
    const {
        data: cards = [],
        isLoading: loading,
        isError: hasError,
        refetch,
    } = useFeynmanCards(subject)

    // Modal state: undefined=closed, null=new(新建), number=编辑/查看
    const [modalCardId, setModalCardId] = useState<number | null | undefined>(
        undefined,
    )
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [shareCard, setShareCard] = useState<FeynmanCard | null>(null)

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
            await feynmanApi.delete(deleteTargetId)
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

            {/* Subject filter */}
            <FeynmanSubjectFilter
                subject={subject}
                onSubjectChange={handleSubjectChange}
            />

            {/* Card list */}
            <FeynmanCardList
                loading={loading}
                hasError={hasError}
                cards={cards}
                onCardClick={(id) => setModalCardId(id)}
                onShare={(card) => setShareCard(card)}
                onDelete={(id) => setDeleteTargetId(id)}
            />

            {/* Editor Modal (新建/编辑/评估/AI对话) */}
            <FeynmanEditorModal
                open={modalCardId !== undefined}
                cardId={modalCardId ?? null}
                onClose={() => {
                    setModalCardId(undefined)
                    refetch()
                }}
                onSaved={() => refetch()}
            />

            {/* Share Modal */}
            <FeynmanModalShare
                open={shareCard != null}
                card={shareCard}
                onCancel={() => setShareCard(null)}
            />

            {/* Delete Confirm Modal */}
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
                    确定要删除这张心得卡吗？此操作不可恢复。
                </p>
            </Modal>
        </div>
    )
}
