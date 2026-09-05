'use client'
/**
 * 学习中心页面模块：组织课程列表与预习/心得/测验/分享等弹窗编辑器，
 * 并提供全局错题本入口（跨课程聚合查看所有测验错题）。
 * 复用约定：列表数据复用 useLessons；弹窗组件按职责拆分为独立编辑器组件。
 * 关键约束：打开测验弹窗时使用列表最新数据回填，避免测验完成后操作列状态陈旧。
 */
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { lessonsApi, studynotesApi } from '@apps/services'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { WrongBookModal } from './components/WrongBookModal'
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

// 心得解锁规则：已生成课堂问答题的课程，须完成问答作答（AI 批改出分）后才能写心得，
// 出分即解锁、不再要求问答得分 ≥ 80，避免用分数二次卡住认真答完的学生；
// 未填预习或无题目（含预习完整度未达 80 分未能生成）则直接可写，照顾超前未预习的学生
function canOpenReflection(lesson: StudyLessonWithStatus): boolean {
    return !lesson.previewQuizGenerated || lesson.previewQuizScore != null
}

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
    const [creating, setCreating] = useState(false)
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
    const [showWrongBook, setShowWrongBook] = useState(false)
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
            // loading 守卫禁用确认按钮，防止耗时期间重复点击创建同名课程
            setCreating(true)
            try {
                await lessonsApi.create({ subject, topic })
                showSnackbar('课程创建成功')
                setShowCreate(false)
                refetch()
            } catch (err) {
                const message = err instanceof Error ? err.message : '创建失败'
                showSnackbar(message, 'error')
            } finally {
                setCreating(false)
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

    // 心得尚未创建时 studynoteId 为 null，需以新建模式打开空白表单，
    // 保存时由 lessonId 建立课程与心得的关联，故此处不能因 studynoteId 为空而拦截
    const handleOpenReflection = useCallback(
        (lesson: StudyLessonWithStatus) => {
            // 已生成课堂问答题的课程须完成问答作答才能打开心得，避免学生跳过课堂问答；
            // 只看是否出分，不卡分数高低
            if (!canOpenReflection(lesson)) {
                showSnackbar('完成课堂问答题后才能写心得', 'error')
                return
            }
            setReflectionLesson(lesson)
            setReflectionCardId(lesson.studynoteId)
        },
        [showSnackbar],
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
        } catch (err) {
            // 与创建/编辑保持一致：透传服务端面向用户的错误信息
            const message = err instanceof Error ? err.message : '删除失败'
            showSnackbar(message, 'error')
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
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowWrongBook(true)}
                        className="btn btn-outline bg-white">
                        错题本
                    </button>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn btn-primary">
                        添加课程
                    </button>
                </div>
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
                canReflection={canOpenReflection}
                onQuiz={setQuizLesson}
                onShare={handleOpenShare}
                onDelete={setDeleteTarget}
            />

            <LessonModalEditor
                open={showCreate}
                lesson={null}
                onCancel={() => setShowCreate(false)}
                onConfirm={handleCreate}
                isLoading={creating}
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

            <WrongBookModal
                open={showWrongBook}
                onClose={() => setShowWrongBook(false)}
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
