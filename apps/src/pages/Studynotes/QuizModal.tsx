'use client'

import { Modal } from '@components/Modal'
import { StudynotesQuizPanel } from './StudynotesQuizPanel'
import type { FC } from 'react'

interface QuizModalProps {
    open: boolean
    cardId: number | null
    canQuiz: boolean
    onClose: () => void
}

export const QuizModal: FC<QuizModalProps> = ({
    open,
    cardId,
    canQuiz,
    onClose,
}) => (
    <Modal
        open={open}
        onCancel={onClose}
        title="专属测验"
        size="xl"
        footer={false}>
        <div className="-m-6 h-[calc(90vh-5rem)]">
            <StudynotesQuizPanel cardId={cardId} canQuiz={canQuiz} />
        </div>
    </Modal>
)
