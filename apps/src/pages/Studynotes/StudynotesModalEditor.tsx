'use client'

import { MessageSquareText } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { studynotesApi } from '@apps/utils/api'
import AiChatPanel from '@components/AiChatPanel'
import { Loading } from '@components/Loading'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { studynotesSubjectLabels, studynotesSubjectValues } from '@shared/utils'
import { EvaluationReport } from './EvaluationReport'
import type {
    StudynotesItem,
    StudynotesEvaluation,
    StudynotesMessage,
    ChatMessage,
} from '@shared/types'

const MAX_FOLLOWUP_ROUNDS = 10

function mapMessages(msgs: StudynotesMessage[]): ChatMessage[] {
    return msgs.map(({ role, content }) => ({ role, content }))
}

interface StudynotesModalEditorProps {
    open: boolean
    cardId: number | null
    onClose: () => void
    onSaved: () => void
}

export const StudynotesModalEditor: React.FC<StudynotesModalEditorProps> = ({
    open,
    cardId,
    onClose,
    onSaved,
}) => {
    const { showSnackbar } = useSnackbar()
    const [hasSaved, setHasSaved] = useState(false)
    const isEditing = cardId != null || hasSaved

    const [subject, setSubject] = useState('math')
    const [topic, setTopic] = useState('')
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

    const canFollowUp = evaluation != null && evaluation.completenessScore >= 80

    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatSending, setChatSending] = useState(false)
    const [hasTriggeredConversation, setHasTriggeredConversation] =
        useState(false)

    const userCount = chatMessages.filter(
        (m) => m.role === 'user',
    ).length
    const conversationActive =
        hasTriggeredConversation &&
        userCount < MAX_FOLLOWUP_ROUNDS
    const conversationComplete = userCount >= MAX_FOLLOWUP_ROUNDS

    const mountedRef = useRef(false)
    const formContainerRef = useRef<HTMLDivElement>(null)
    const formSnapshotRef = useRef<{
        subject: string
        topic: string
        summary: string
        example: string
        stuckPoints: string
        memoryHook: string | null
    } | null>(null)

    // Resize all form textareas to fit content immediately after DOM mounts or values change.
    // Depends on `open`/`loadingCard` too: re-opening a card keeps the same field values,
    // so the fields remount at default rows unless we re-measure when the form becomes visible.
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
            snap.subject !== subject ||
            snap.topic !== topic ||
            snap.summary !== summary ||
            snap.example !== example ||
            snap.stuckPoints !== stuckPoints.trim() ||
            (snap.memoryHook ?? null) !== (memoryHook || null)
        )
    }

    useEffect(() => {
        if (!open) return
        mountedRef.current = true
        setChatMessages([])
        setHasTriggeredConversation(false)
        setEvaluation(null)
        setEvaluationError(false)
        setCurrentCard(null)
        setHasSaved(false)
        formSnapshotRef.current = null

        if (cardId != null) {
            setLoadingCard(true)
            studynotesApi
                .get(cardId)
                .then(async (card) => {
                    if (!mountedRef.current) return
                    setCurrentCard(card)
                    setSubject(card.subject)
                    setTopic(card.topic)
                    setSummary(card.summary)
                    setExample(card.example)
                    setStuckPoints(card.stuckPoints)
                    setMemoryHook(card.memoryHook || '')
                    formSnapshotRef.current = {
                        subject: card.subject,
                        topic: card.topic,
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
                    try {
                        const msgs = await studynotesApi.getMessages(card.id)
                        if (!mountedRef.current) return
                        if (msgs.length > 0) {
                            setChatMessages(mapMessages(msgs))
                        }
                    } catch {
                        // No messages yet
                    }
                })
                .catch(() => showSnackbar('加载学习心得失败', 'error'))
                .finally(() => {
                    if (mountedRef.current) setLoadingCard(false)
                })
        } else {
            formSnapshotRef.current = {
                subject: 'math',
                topic: '',
                summary: '',
                example: '',
                stuckPoints: '',
                memoryHook: null,
            }
            setSubject('math')
            setTopic('')
            setSummary('')
            setExample('')
            setStuckPoints('')
            setMemoryHook('')
        }
        return () => {
            mountedRef.current = false
        }
    }, [open, cardId, showSnackbar])

    const handleSave = useCallback(async () => {
        const targetId = cardId ?? currentCard?.id ?? null

        // 评分失败后点击「保存并评分」属于二次评分：内容未变也允许执行，且仅重评不重复保存
        const isRetry =
            evaluationError && targetId != null && !hasContentChanged()
        const hasBeenEvaluated = !!(currentCard?.evaluatedAt || currentCard?.evaluation)

        // 从未评估过时，即使内容无变化也执行评估
        if (!isRetry && targetId != null && !hasContentChanged() && hasBeenEvaluated) {
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
                    subject,
                    topic,
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
                          })

                setCurrentCard(card)
                setHasSaved(true)
                formSnapshotRef.current = {
                    subject: card.subject,
                    topic: card.topic,
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
    }, [cardId, currentCard, evaluationError, subject, topic, summary, example, stuckPoints, memoryHook, showSnackbar, onSaved])

    const runFollowUp = useCallback(async (message?: string) => {
        if (!currentCard) {
            showSnackbar(
                message ? '请先保存卡片后再发送消息' : '请先保存卡片',
                'error',
            )
            return
        }
        if (!canFollowUp) {
            showSnackbar('评分未达到80分，暂无法进行测验', 'error')
            return
        }
        setHasTriggeredConversation(true)
        setChatSending(true)
        const MAX_RETRIES = 1
        let lastError: unknown
        for (let i = 0; i <= MAX_RETRIES; i++) {
            try {
                const result = await studynotesApi.followUp(currentCard.id, message)
                setChatMessages(mapMessages(result.messages))
                lastError = undefined
                break
            } catch (err) {
                lastError = err
                if (i < MAX_RETRIES) {
                    await new Promise((r) => setTimeout(r, 2000))
                }
            }
        }
        if (lastError) {
            showSnackbar(
                message ? '发送失败，请稍后重试' : '测验出错，请稍后重试',
                'error',
            )
        }
        setChatSending(false)
    }, [currentCard, canFollowUp, showSnackbar])

    const handleFollowUp = useCallback(() => runFollowUp(), [runFollowUp])

    const handleChatSend = useCallback((message: string) => runFollowUp(message), [runFollowUp])

    function getEmptyText(): string {
        if (!currentCard) return '请先保存卡片后再使用 AI 功能'
        if (!canFollowUp) return '评分未达80分，暂无法测验'
        if (!hasTriggeredConversation) return '点击"开始测验"进行10道题智能测验'
        if (conversationComplete) return '本轮测验已结束，可再次点击"重新测验"开始新一轮'
        return ''
    }

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
            title={isEditing ? '编辑学习心得' : '新建学习心得'}
            size="full">
            {loadingCard ? (
                <Loading />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden -m-6">
                    {/* ===== Left: 编辑表单 ===== */}
                    <div
                        ref={formContainerRef}
                        className="space-y-4 overflow-y-auto max-h-[calc(90vh-9rem)] p-3">
                        {/* Subject + Topic */}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    学科
                                </label>
                                <select
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                                    {studynotesSubjectValues.map((s) => (
                                        <option key={s} value={s}>
                                            {studynotesSubjectLabels[s]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    课题/章节
                                </label>
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={(e) => setTopic(e.target.value)}
                                    placeholder="如：分数的加减法"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>
                        </div>

                        {/* AI 评估报告 */}
                        {(evaluation || evaluating) && (
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                {evaluation ? (
                                    <EvaluationReport evaluation={evaluation} />
                                ) : (
                                    <p className="text-sm text-gray-500">
                                        AI 评分生成中...
                                    </p>
                                )}
                            </div>
                        )}

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

                    {/* ===== Right: AI 辅导员 ===== */}
                    <div className="flex flex-col h-full min-h-0 max-h-[calc(90vh-9rem)]">
                        {/* AiChatPanel */}
                        <div className="flex-1 min-h-0">
                            <AiChatPanel
                                messages={chatMessages}
                                onSend={handleChatSend}
                                sending={chatSending}
                                aiHelperName=""
                                emptyText={getEmptyText()}
                                inputPlaceholder="输入你的答案...">
                                <button
                                    onClick={handleFollowUp}
                                    disabled={
                                        chatSending ||
                                        !currentCard ||
                                        !canFollowUp ||
                                        conversationActive
                                    }
                                    className="btn btn-outline btn-sm">
                                    <MessageSquareText className="size-4" />
                                    <span className="ml-1">
                                        {conversationComplete
                                            ? '重新测验'
                                            : '开始测验'}
                                    </span>
                                </button>
                            </AiChatPanel>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    )
}
