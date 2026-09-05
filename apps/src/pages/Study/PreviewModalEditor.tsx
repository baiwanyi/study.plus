'use client'
/**
 * 课前预习弹窗组件：预习三问表单（SQ3R/K-W-L）的编辑、保存与 AI 分析报告展示。
 * 复用约定：表单题项复用 @shared/constants 的 previewStudyQuestions；分析报告复用
 * PreviewAnalysisReport；保存与分析链路复用 lessonsApi。
 * 关键约束：加载以课程 ID 为依赖（对象引用随列表刷新变化，不得作为依赖清空输入）；
 * 请求序号防跨课程数据串扰；内容为空时禁用提交。
 */
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { lessonsApi } from '@apps/services'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { previewStudyQuestions } from '@shared/constants'
import { PreviewAnalysisReport } from './components/PreviewAnalysisReport'
import { PreviewQuizPanel } from './components/PreviewQuizPanel'
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

    // 依赖课程 ID 而非 lesson 对象：列表 refetch 会重建 lesson 引用（如窗口聚焦自动刷新），
    // 若依赖对象引用，正在输入的表单会被静默清空重载，造成输入丢失
    const lessonId = lesson?.id
    useEffect(() => {
        if (!open || lessonId == null) return
        const myReq = ++requestIdRef.current
        setAnalysis(null)
        setAnalysisError(false)
        setContent('')
        setOldKnowledge('')
        setQuestions('')

        lessonsApi
            .getPreview(lessonId)
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
                        // 历史数据格式异常时降级为未分析状态，不阻断表单使用
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
    }, [open, lessonId, showSnackbar])

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
        } catch (err) {
            // 与其它写操作一致：透传服务端面向用户的错误信息
            const message = err instanceof Error ? err.message : '保存失败'
            showSnackbar(message, 'error')
        } finally {
            setSaving(false)
        }
    }, [lesson, content, oldKnowledge, questions, showSnackbar, onSaved])

    function getConfirmLabel(): string {
        if (analyzing) return '分析中...'
        if (saving) return '保存中...'
        return '保存并分析'
    }

    // 表单题项的值/写入器映射：避免渲染层的嵌套三元（规范禁止）
    type QuestionKey = (typeof previewStudyQuestions)[number]['key']
    function getFieldValue(key: QuestionKey): string {
        if (key === 'content') return content
        if (key === 'oldKnowledge') return oldKnowledge
        return questions
    }
    function setFieldValue(key: QuestionKey, value: string): void {
        if (key === 'content') setContent(value)
        else if (key === 'oldKnowledge') setOldKnowledge(value)
        else setQuestions(value)
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden min-h-full -m-6">
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
                                value={getFieldValue(q.key)}
                                onChange={(e) =>
                                    setFieldValue(q.key, e.target.value)
                                }
                                placeholder={q.placeholder}
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>
                    ))}

                    {/* 预习与课堂要求说明 */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                        <p className="text-sm font-bold text-amber-800 mb-2">
                            预习与课堂要求
                        </p>
                        <ol className="list-decimal list-inside space-y-1.5 text-xs leading-relaxed text-amber-900">
                            <li>预习完整度评分达到 <b>80 分</b> 以上，方可开启课堂问答题。</li>
                            <li>请用 <b>不同颜色的笔</b> 将「正式课上要注意的重点」与「课堂问答题」分别抄录到课本；课上得到答案后填写于课本，并反馈给本系统。</li>
                            <li>课堂问答题生成后，须完成作答并经 AI 批改（不限分数），即可开启学习心得。</li>
                        </ol>
                    </div>

                </div>

                {/* ===== Right: AI 分析报告 ===== */}
                <div className="overflow-y-auto max-h-[calc(90vh-9rem)] border-l border-gray-200 p-5">
                    {analyzing ? (
                        <p className="text-sm text-gray-500">
                            AI 分析生成中...
                        </p>
                    ) : analysis ? (
                        <>
                            <PreviewAnalysisReport analysis={analysis} />
                            {/* 课堂问答题面板常驻显示；未达标时由面板内部提示达标要求 */}
                            <PreviewQuizPanel
                                lessonId={lesson?.id ?? 0}
                                completenessScore={analysis.completenessScore}
                            />
                        </>
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
