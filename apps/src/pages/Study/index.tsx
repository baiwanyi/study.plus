'use client'

import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { lessonsApi, studynotesApi } from '@apps/utils/api'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { useLessons } from './hooks/useLessons'
import { LessonModalEditor } from './LessonModalEditor'
import { LessonsListTable } from './LessonsListTable'
import { PreviewModalEditor } from './PreviewModalEditor'
import { QuizModalEditor } from './QuizModalEditor'
import { StudynotesModalEditor } from './StudynotesModalEditor'
import { StudynotesModalShare } from './StudynotesModalShare'
import { StudynotesSubjectFilter } from './StudynotesSubjectFilter'
import type { StudyLessonWithStatus, StudynotesItem } from '@shared/types'
import type { FC } from 'react'

export const Studynotes: FC = () => {
    const { showSnackbar } = useSnackbar()
    const [searchParams, setSearchParams] = useSearchParams()
    const subject = searchParams.get('subject') || ''
    const {
        data: lessons = [],
        isLoading: loading,
        isError: hasError,
        refetch,
    } = useLessons(subject)

    const [showCreate, setShowCreate] = useState(false)
    const [editLesson, setEditLesson] = useState<StudyLessonWithStatus | null>(
        null,
    )
    const [editSaving, setEditSaving] = useState(false)
    const [previewLesson, setPreviewLesson] =
        useState<StudyLessonWithStatus | null>(null)
    const [reflectionLesson, setReflectionLesson] =
        useState<StudyLessonWithStatus | null>(null)
    const [reflectionCardId, setReflectionCardId] = useState<number | null>(
        null,
    )
    const [quizLesson, setQuizLesson] = useState<StudyLessonWithStatus | null>(
        null,
    )
    const [shareCard, setShareCard] = useState<StudynotesItem | null>(null)
    const [deleteTarget, setDeleteTarget] =
        useState<StudyLessonWithStatus | null>(null)
    const [deleting, setDeleting] = useState(false)

    const handleSubjectChange = (value: string) => {
        if (value) {
            setSearchParams({ subject: value })
        } else {
            setSearchParams((prev) => {
                prev.delete('subject')
                return prev
            })
        }
    }

    const handleCreate = useCallback(
        async (subject: string, topic: string) => {
            try {
                await lessonsApi.create({ subject, topic })
                showSnackbar('课程创建成功')
                setShowCreate(false)
                refetch()
            } catch (err) {
                const message = err instanceof Error ? err.message : '创建失败'
                showSnackbar(message, 'error')
            }
        },
        [showSnackbar, refetch],
    )

    const handleEditSave = useCallback(
        async (subject: string, topic: string) => {
            if (!editLesson) return
            setEditSaving(true)
            try {
                await lessonsApi.update(editLesson.id, { subject, topic })
                showSnackbar('保存成功')
                setEditLesson(null)
                refetch()
            } catch (err) {
                const message = err instanceof Error ? err.message : '保存失败'
                showSnackbar(message, 'error')
            } finally {
                setEditSaving(false)
            }
        },
        [editLesson, showSnackbar, refetch],
    )

    const handleOpenReflection = useCallback(
        (lesson: StudyLessonWithStatus) => {
            if (lesson.studynoteId == null) return
            setReflectionLesson(lesson)
            setReflectionCardId(lesson.studynoteId)
        },
        [],
    )

    const handleOpenShare = useCallback(
        async (lesson: StudyLessonWithStatus) => {
            if (lesson.studynoteId == null) return
            try {
                const card = await studynotesApi.get(lesson.studynoteId)
                setShareCard(card)
            } catch {
                setShareCard(null)
                showSnackbar('加载学习管理失败，请重试', 'error')
            }
        },
        [showSnackbar],
    )

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            await lessonsApi.delete(deleteTarget.id)
            showSnackbar('删除成功')
            setDeleteTarget(null)
            refetch()
        } catch {
            showSnackbar('删除失败，请重试', 'error')
        } finally {
            setDeleting(false)
        }
    }, [deleteTarget, showSnackbar, refetch])

    // 打开测验时使用列表最新数据，避免测验完成回写后操作列状态陈旧
    const activeQuizLesson =
        lessons.find((l) => l.id === quizLesson?.id) ?? quizLesson

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2>学习中心</h2>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn btn-primary">
                    添加课程
                </button>
            </div>

            <StudynotesSubjectFilter
                subject={subject}
                onSubjectChange={handleSubjectChange}
            />

            <LessonsListTable
                loading={loading}
                hasError={hasError}
                lessons={lessons}
                onEdit={setEditLesson}
                onPreview={setPreviewLesson}
                onReflection={handleOpenReflection}
                onQuiz={setQuizLesson}
                onShare={handleOpenShare}
                onDelete={setDeleteTarget}
            />

            <LessonModalEditor
                open={showCreate}
                lesson={null}
                onCancel={() => setShowCreate(false)}
                onConfirm={handleCreate}
            />

            <LessonModalEditor
                open={editLesson != null}
                lesson={editLesson}
                onCancel={() => setEditLesson(null)}
                onConfirm={handleEditSave}
                isLoading={editSaving}
            />

            <PreviewModalEditor
                open={previewLesson != null}
                lesson={previewLesson}
                onClose={() => setPreviewLesson(null)}
                onSaved={() => refetch()}
            />

            <StudynotesModalEditor
                open={reflectionLesson != null}
                cardId={reflectionCardId}
                lessonId={reflectionLesson?.id ?? null}
                lessonSubject={reflectionLesson?.subject ?? ''}
                lessonTopic={reflectionLesson?.topic ?? ''}
                onClose={() => {
                    setReflectionLesson(null)
                    setReflectionCardId(null)
                    refetch()
                }}
                onSaved={() => refetch()}
            />

            <QuizModalEditor
                open={quizLesson != null}
                cardId={activeQuizLesson?.studynoteId ?? null}
                lessonTopic={activeQuizLesson?.topic ?? ''}
                canQuiz={
                    activeQuizLesson?.id != null &&
                    activeQuizLesson.studynoteScore != null &&
                    activeQuizLesson.studynoteScore >= 80
                }
                onClose={() => {
                    setQuizLesson(null)
                    refetch()
                }}
            />

            <StudynotesModalShare
                open={shareCard != null}
                card={shareCard}
                onCancel={() => setShareCard(null)}
            />

            <Modal
                open={deleteTarget != null}
                onCancel={() => setDeleteTarget(null)}
                title="确认删除"
                size="sm"
                danger
                confirmLabel="确认删除"
                onConfirm={handleDelete}
                isLoading={deleting}>
                <p className="text-sm text-gray-600">
                    确定要删除课程「{deleteTarget?.topic}
                    」吗？该课程下的预习、学习管理和测验将一并删除，此操作不可恢复。
                </p>
            </Modal>
        </div>
    )
}
