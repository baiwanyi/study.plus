'use client'

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { lessonsApi } from '@apps/utils/api'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { previewStudyQuestions } from '@shared/constants'
import { PreviewAnalysisReport } from './PreviewAnalysisReport'
import type { PreviewAnalysis, StudyLessonWithStatus } from '@shared/types'
import type { FC } from 'react'

interface PreviewModalEditorProps {
    open: boolean
    lesson: StudyLessonWithStatus | null
    onClose: () => void
    onSaved: () => void
}

export const PreviewModalEditor: FC<PreviewModalEditorProps> = ({
    open,
    lesson,
    onClose,
    onSaved,
}) => {
    const { showSnackbar } = useSnackbar()

    const [content, setContent] = useState('')
    const [oldKnowledge, setOldKnowledge] = useState('')
    const [questions, setQuestions] = useState('')

    const [saving, setSaving] = useState(false)
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisError, setAnalysisError] = useState(false)
    const [analysis, setAnalysis] = useState<PreviewAnalysis | null>(null)

    // 请求序号：每次打开/切换课程自增，确保只有最新一次加载能写入，避免跨课程数据串扰
    const requestIdRef = useRef(0)
    const formContainerRef = useRef<HTMLDivElement>(null)

    // Resize all form textareas to fit content immediately after DOM mounts or values change.
    useLayoutEffect(() => {
        if (!open) return
        const container = formContainerRef.current
        if (!container) return
        const textareas =
            container.querySelectorAll<HTMLTextAreaElement>('.form-textarea')
        textareas.forEach((el) => {
            el.style.height = '1px'
            el.style.height = `${el.scrollHeight + 2}px`
        })
    }, [open, content, oldKnowledge, questions])

    useEffect(() => {
        if (!open || !lesson) return
        const myReq = ++requestIdRef.current
        setAnalysis(null)
        setAnalysisError(false)
        setContent('')
        setOldKnowledge('')
        setQuestions('')

        lessonsApi
            .getPreview(lesson.id)
            .then(({ preview }) => {
                // 仅最新一次请求可写入，丢弃过期响应，避免课程切换时的数据串扰
                if (myReq !== requestIdRef.current) return
                setContent(preview?.content ?? '')
                setOldKnowledge(preview?.oldKnowledge ?? '')
                setQuestions(preview?.questions ?? '')
                if (preview?.aiAnalysis) {
                    try {
                        setAnalysis(JSON.parse(preview.aiAnalysis))
                    } catch {
                        /* empty */
                    }
                }
            })
            .catch(() => {
                if (myReq !== requestIdRef.current) return
                // 加载失败：复位分析与错误状态，避免残留上一课程报告
                setAnalysis(null)
                setAnalysisError(false)
                showSnackbar('加载预习内容失败', 'error')
            })
    }, [open, lesson, showSnackbar])

    const handleSaveAndAnalyze = useCallback(async () => {
        if (!lesson) return
        setSaving(true)
        setAnalysisError(false)
        try {
            // 保存内容（内容变化时后端会作废旧分析，保证重新分析）
            await lessonsApi.savePreview(lesson.id, {
                content,
                oldKnowledge,
                questions,
            })

            setAnalyzing(true)
            setAnalysis(null)
            try {
                const result = await lessonsApi.analyzePreview(lesson.id)
                setAnalysis(result.analysis)
                setAnalysisError(false)
                showSnackbar('保存并分析成功')
                onSaved()
            } catch {
                setAnalysisError(true)
                showSnackbar(
                    '内容已保存，但 AI 分析失败，可点击"保存并分析"重试',
                    'error',
                )
            } finally {
                setAnalyzing(false)
            }
        } catch {
            showSnackbar('保存失败，请重试', 'error')
        } finally {
            setSaving(false)
        }
    }, [lesson, content, oldKnowledge, questions, showSnackbar, onSaved])

    function getConfirmLabel(): string {
        if (analyzing) return '分析中...'
        if (saving) return '保存中...'
        return '保存并分析'
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onConfirm={handleSaveAndAnalyze}
            confirmLabel={getConfirmLabel()}
            isDisabled={saving || analyzing || !content.trim()}
            isLoading={saving || analyzing}
            title={lesson ? `课前预习 · ${lesson.topic}` : '课前预习'}
            size="full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden h-full -m-6">
                {/* ===== Left: 预习表单 ===== */}
                <div
                    ref={formContainerRef}
                    className="space-y-4 overflow-y-auto max-h-[calc(90vh-9rem)] p-3">
                    {previewStudyQuestions.map((q) => (
                        <div
                            key={q.key}
                            className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                {q.title}
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                {q.hint}
                            </p>
                            <textarea
                                value={
                                    q.key === 'content'
                                        ? content
                                        : q.key === 'oldKnowledge'
                                          ? oldKnowledge
                                          : questions
                                }
                                onChange={(e) => {
                                    const value = e.target.value
                                    if (q.key === 'content') setContent(value)
                                    else if (q.key === 'oldKnowledge')
                                        setOldKnowledge(value)
                                    else setQuestions(value)
                                }}
                                placeholder={q.placeholder}
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>
                    ))}
                </div>

                {/* ===== Right: AI 分析报告 ===== */}
                <div className="overflow-y-auto max-h-[calc(90vh-9rem)] border-l border-gray-200 p-5">
                    {analyzing ? (
                        <p className="text-sm text-gray-500">
                            AI 分析生成中...
                        </p>
                    ) : analysis ? (
                        <PreviewAnalysisReport analysis={analysis} />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                            <p className="text-sm text-gray-600">
                                {analysisError
                                    ? 'AI 分析失败，请点击"保存并分析"重试'
                                    : '保存并分析后，这里会显示预习建议和课堂注意事项'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}
