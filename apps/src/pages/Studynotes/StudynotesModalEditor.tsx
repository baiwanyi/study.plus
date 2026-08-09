'use client'

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react'
import { studynotesApi } from '@apps/utils/api'
import { Loading } from '@components/Loading'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { EvaluationReport } from './EvaluationReport'
import type { StudynotesItem, StudynotesEvaluation } from '@shared/types'

interface StudynotesModalEditorProps {
    open: boolean
    cardId: number | null
    /** 关联的课程 ID（新建心得时传入） */
    lessonId: number | null
    /** 课程学科（心得归属课程，表单不再单独填写） */
    lessonSubject: string
    /** 课程课题（心得归属课程，表单不再单独填写） */
    lessonTopic: string
    onClose: () => void
    onSaved: () => void
}

export const StudynotesModalEditor: React.FC<StudynotesModalEditorProps> = ({
    open,
    cardId,
    lessonId,
    lessonSubject,
    lessonTopic,
    onClose,
    onSaved,
}) => {
    const { showSnackbar } = useSnackbar()

    const [summary, setSummary] = useState('')
    const [example, setExample] = useState('')
    const [stuckPoints, setStuckPoints] = useState('')
    const [memoryHook, setMemoryHook] = useState('')

    const [saving, setSaving] = useState(false)
    const [evaluating, setEvaluating] = useState(false)
    const [evaluationError, setEvaluationError] = useState(false)
    const [loadingCard, setLoadingCard] = useState(false)

    const [evaluation, setEvaluation] = useState<StudynotesEvaluation | null>(
        null,
    )
    const [currentCard, setCurrentCard] = useState<StudynotesItem | null>(null)

    // 请求序号：每次打开/切换卡片自增，确保只有最新一次加载能写入，避免跨卡片数据串扰
    const requestIdRef = useRef(0)
    const formContainerRef = useRef<HTMLDivElement>(null)
    const formSnapshotRef = useRef<{
        summary: string
        example: string
        stuckPoints: string
        memoryHook: string | null
    } | null>(null)

    // Resize all form textareas to fit content immediately after DOM mounts or values change.
    useLayoutEffect(() => {
        if (!open || loadingCard) return
        const container = formContainerRef.current
        if (!container) return
        const textareas =
            container.querySelectorAll<HTMLTextAreaElement>('.form-textarea')
        textareas.forEach((el) => {
            el.style.height = '1px'
            // scrollHeight excludes borders; border-box sizing needs border height added
            el.style.height = `${el.scrollHeight + 2}px`
        })
    }, [open, loadingCard, summary, example, stuckPoints, memoryHook])

    function hasContentChanged(): boolean {
        const snap = formSnapshotRef.current
        if (!snap) return true
        return (
            snap.summary !== summary ||
            snap.example !== example ||
            snap.stuckPoints !== stuckPoints.trim() ||
            (snap.memoryHook ?? null) !== (memoryHook || null)
        )
    }

    useEffect(() => {
        if (!open) return
        const myReq = ++requestIdRef.current
        setEvaluation(null)
        setEvaluationError(false)
        setCurrentCard(null)
        formSnapshotRef.current = null

        if (cardId != null) {
            setLoadingCard(true)
            studynotesApi
                .get(cardId)
                .then(async (card) => {
                    // 仅最新一次请求可写入，丢弃过期响应，避免卡片切换时的数据串扰
                    if (myReq !== requestIdRef.current) return
                    setCurrentCard(card)
                    setSummary(card.summary)
                    setExample(card.example)
                    setStuckPoints(card.stuckPoints)
                    setMemoryHook(card.memoryHook || '')
                    formSnapshotRef.current = {
                        summary: card.summary,
                        example: card.example,
                        stuckPoints: card.stuckPoints.trim(),
                        memoryHook: card.memoryHook ?? null,
                    }
                    if (card.evaluation) {
                        try {
                            setEvaluation(JSON.parse(card.evaluation))
                        } catch {
                            /* empty */
                        }
                    }
                })
                .catch(() => {
                    if (myReq !== requestIdRef.current) return
                    // 加载失败：复位为空白表单，避免显示上一卡片残留内容（含旧评估报告）
                    setSummary('')
                    setExample('')
                    setStuckPoints('')
                    setMemoryHook('')
                    setCurrentCard(null)
                    setEvaluation(null)
                    setEvaluationError(false)
                    formSnapshotRef.current = null
                    showSnackbar('加载学习心得失败', 'error')
                })
                .finally(() => {
                    if (myReq === requestIdRef.current) setLoadingCard(false)
                })
        } else {
            formSnapshotRef.current = {
                summary: '',
                example: '',
                stuckPoints: '',
                memoryHook: null,
            }
            setSummary('')
            setExample('')
            setStuckPoints('')
            setMemoryHook('')
        }
    }, [open, cardId, showSnackbar])

    const handleSave = useCallback(async () => {
        const targetId = cardId ?? currentCard?.id ?? null

        // 评分失败后点击「保存并评分」属于二次评分：内容未变也允许执行，且仅重评不重复保存
        const isRetry =
            evaluationError && targetId != null && !hasContentChanged()
        const hasBeenEvaluated = !!(
            currentCard?.evaluatedAt || currentCard?.evaluation
        )

        // 从未评估过时，即使内容无变化也执行评估
        if (
            !isRetry &&
            targetId != null &&
            !hasContentChanged() &&
            hasBeenEvaluated
        ) {
            showSnackbar('内容没有变化')
            return
        }

        setSaving(true)
        try {
            let card: StudynotesItem
            if (isRetry) {
                // 二次评分：卡片已保存，仅重新评估，跳过内容保存
                if (!currentCard) {
                    showSnackbar('未找到已保存的卡片，请重试', 'error')
                    return
                }
                card = currentCard
            } else {
                const baseData = {
                    subject: lessonSubject,
                    topic: lessonTopic,
                    summary,
                    example,
                    stuckPoints: stuckPoints.trim(),
                }

                card =
                    targetId != null
                        ? await studynotesApi.update(targetId, {
                              ...baseData,
                              memoryHook: memoryHook || null,
                          })
                        : await studynotesApi.create({
                              ...baseData,
                              ...(memoryHook ? { memoryHook } : {}),
                              ...(lessonId != null ? { lessonId } : {}),
                          })

                setCurrentCard(card)
                formSnapshotRef.current = {
                    summary: card.summary,
                    example: card.example,
                    stuckPoints: card.stuckPoints.trim(),
                    memoryHook: card.memoryHook ?? null,
                }
            }

            // 清空旧评分内容，等待新评分生成后再写入
            setEvaluation(null)
            setEvaluationError(false)
            setEvaluating(true)
            try {
                const evalResult = await studynotesApi.evaluate(card.id)
                setEvaluation(evalResult.evaluation)
                setCurrentCard((prev) =>
                    prev
                        ? {
                              ...prev,
                              evaluation: JSON.stringify(evalResult.evaluation),
                              evaluatedAt: evalResult.evaluatedAt,
                          }
                        : prev,
                )
                setEvaluating(false)
                setEvaluationError(false)
                showSnackbar('保存并评估成功')
                onSaved()
            } catch {
                // 评分失败：保留已保存内容，标记错误，允许二次评分
                setEvaluating(false)
                setEvaluationError(true)
                showSnackbar(
                    '内容已保存，但 AI 评估失败，可点击"保存并评分"重试',
                    'error',
                )
            }
        } catch {
            showSnackbar('保存失败，请重试', 'error')
        } finally {
            setSaving(false)
        }
    }, [
        cardId,
        currentCard,
        evaluationError,
        lessonId,
        lessonSubject,
        lessonTopic,
        summary,
        example,
        stuckPoints,
        memoryHook,
        showSnackbar,
        onSaved,
    ])

    function getConfirmLabel(): string {
        if (evaluating) return '评估中...'
        if (saving) return '保存中...'
        return '保存并评估'
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel={getConfirmLabel()}
            isDisabled={
                saving || evaluating || loadingCard || !summary || !example
            }
            isLoading={saving || evaluating}
            title={lessonTopic ? `学习心得 · ${lessonTopic}` : '学习心得'}
            size="full">
            {loadingCard ? (
                <Loading />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden -m-6">
                    {/* ===== Left: 编辑表单 ===== */}
                    <div
                        ref={formContainerRef}
                        className="space-y-4 overflow-y-auto max-h-[calc(90vh-9rem)] p-3">
                        {/* Q1: Summary */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                问题一：用一句话概括今天学到的核心知识
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                请用一句完整的话概括这节课最核心的概念、公式或规则
                            </p>
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder="如：分数加减要先通分，然后分子相加减"
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>

                        {/* Q2: Example */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                问题二：举一个自己的例子来解释它
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                请编一个自己的例子（生活场景、故事都可以），必须和课本不一样
                            </p>
                            <textarea
                                value={example}
                                onChange={(e) => setExample(e.target.value)}
                                placeholder="如：就像分披萨，一个披萨切成4份，另一个切成6份，两个人吃的份数不一样，要先把它们切成同样大小才能比"
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>

                        {/* Q3: Stuck Points */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                问题三：刚才哪里卡住了？
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                认真想一想，上面写概括或举例子时，哪一个点让你犹豫或者说不出了？如果没有卡壳的地方，则留空。
                            </p>
                            <textarea
                                value={stuckPoints}
                                onChange={(e) => setStuckPoints(e.target.value)}
                                placeholder="如：通分的时候不知道找最小公倍数还是直接乘分母"
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>

                        {/* Memory Hook */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                复习锚点：记忆钩子（选填）
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                如果明天我要复习，我只看自己写的哪句话就够了？
                            </p>
                            <textarea
                                value={memoryHook}
                                onChange={(e) => setMemoryHook(e.target.value)}
                                placeholder="把三个问题里最精练的那句话抄下来"
                                rows={1}
                                className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                            />
                        </div>
                    </div>

                    {/* ===== Right: AI 评估报告 ===== */}
                    <div className="overflow-y-auto max-h-[calc(90vh-9rem)] border-l border-gray-200 p-5">
                        {evaluating ? (
                            <p className="text-sm text-gray-500">
                                AI 评分生成中...
                            </p>
                        ) : evaluation ? (
                            <EvaluationReport evaluation={evaluation} />
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                                <p className="text-sm text-gray-600">
                                    {evaluationError
                                        ? 'AI 评估失败，请点击"保存并评分"重试'
                                        : '保存并评分后，这里会显示完整度评估报告'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </Modal>
    )
}
