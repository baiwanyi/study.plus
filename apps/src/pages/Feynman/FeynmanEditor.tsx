'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessageSquareText, Sparkles } from 'lucide-react'
import { feynmanApi } from '@apps/utils/api'
import { feynmanSubjectLabels, feynmanSubjectValues } from '@shared/utils'
import type {
    FeynmanCard,
    FeynmanEvaluation,
    FeynmanMessage,
    ChatMessage,
} from '@shared/types'
import AiChatPanel from '@components/AiChatPanel'
import { Loading } from '@components/Loading'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { EvaluationReport } from './EvaluationReport'

interface FeynmanEditorModalProps {
    open: boolean
    cardId: number | null // null = 新建, number = 编辑
    onClose: () => void
    onSaved: () => void
}

export const FeynmanEditorModal: React.FC<FeynmanEditorModalProps> = ({
    open,
    cardId,
    onClose,
    onSaved,
}) => {
    const { showSnackbar } = useSnackbar()
    const isEditing = cardId != null

    // Form state
    const [subject, setSubject] = useState('math')
    const [topic, setTopic] = useState('')
    const [summary, setSummary] = useState('')
    const [example, setExample] = useState('')
    const [stuckPoints, setStuckPoints] = useState('')
    const [memoryHook, setMemoryHook] = useState('')

    const [saving, setSaving] = useState(false)
    const [evaluating, setEvaluating] = useState(false)
    const [loadingCard, setLoadingCard] = useState(false)

    // Evaluation & current card
    const [evaluation, setEvaluation] = useState<FeynmanEvaluation | null>(null)
    const [currentCard, setCurrentCard] = useState<FeynmanCard | null>(null)

    // Chat (AiChatPanel 对话)
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatSending, setChatSending] = useState(false)
    const [hasTriggeredConversation, setHasTriggeredConversation] =
        useState(false)

    // Reset form / load card when opening
    useEffect(() => {
        if (!open) return
        setChatMessages([])
        setHasTriggeredConversation(false)
        setEvaluation(null)
        setCurrentCard(null)

        if (cardId != null) {
            setLoadingCard(true)
            feynmanApi
                .get(cardId)
                .then(async (card) => {
                    setCurrentCard(card)
                    setSubject(card.subject)
                    setTopic(card.topic)
                    setSummary(card.summary)
                    setExample(card.example)
                    setStuckPoints(card.stuckPoints)
                    setMemoryHook(card.memoryHook || '')
                    if (card.evaluation) {
                        try {
                            setEvaluation(JSON.parse(card.evaluation))
                        } catch {
                            /* empty */
                        }
                    }
                    // Load historical messages
                    try {
                        const msgs = await feynmanApi.getMessages(card.id)
                        if (msgs.length > 0) {
                            setChatMessages(
                                msgs.map((m: FeynmanMessage) => ({
                                    role: m.role,
                                    content: m.content,
                                })),
                            )
                        }
                    } catch {
                        // No messages yet — ignore
                    }
                })
                .catch(() => showSnackbar('加载心得卡失败', 'error'))
                .finally(() => setLoadingCard(false))
        } else {
            setSubject('math')
            setTopic('')
            setSummary('')
            setExample('')
            setStuckPoints('')
            setMemoryHook('')
        }
    }, [open, cardId, showSnackbar])

    const handleSave = async () => {
        setSaving(true)
        try {
            const data = {
                subject,
                topic,
                summary,
                example,
                stuckPoints,
                ...(memoryHook ? { memoryHook } : {}),
            }

            let card: FeynmanCard
            if (isEditing && cardId != null) {
                card = await feynmanApi.update(cardId, data)
            } else {
                card = await feynmanApi.create(data)
            }

            // 服务端 PUT 不再清空 evaluation
            setCurrentCard(card)

            // 无卡壳时自动触发追问
            const isStuckEmpty =
                !stuckPoints.trim() ||
                stuckPoints.trim() === '没有' ||
                stuckPoints.trim() === '都懂了' ||
                stuckPoints.trim() === '没有卡壳'

            if (isStuckEmpty) {
                setChatSending(true)
                setHasTriggeredConversation(true)
                try {
                    const result = await feynmanApi.followUp(card.id)
                    setChatMessages(
                        result.messages.map((m) => ({
                            role: m.role,
                            content: m.content,
                        })),
                    )
                } catch {
                    setChatMessages([
                        {
                            role: 'assistant' as const,
                            content: '追问出错，请稍后重试',
                        },
                    ])
                } finally {
                    setChatSending(false)
                }
            } else {
                showSnackbar('保存成功')
                onSaved()
            }
        } catch {
            showSnackbar('保存失败，请重试', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleEvaluate = async () => {
        if (!currentCard) {
            showSnackbar('请先保存卡片', 'error')
            return
        }
        setEvaluating(true)
        try {
            const result = await feynmanApi.evaluate(currentCard.id)
            setEvaluation(result.evaluation)
            setCurrentCard((prev) =>
                prev
                    ? {
                          ...prev,
                          evaluation: JSON.stringify(result.evaluation),
                          evaluatedAt: result.evaluatedAt,
                      }
                    : prev,
            )
            showSnackbar('评估完成')
        } catch {
            showSnackbar('AI 评估失败，请稍后重试', 'error')
        } finally {
            setEvaluating(false)
        }
    }

    const handleFollowUp = async () => {
        if (!currentCard) {
            showSnackbar('请先保存卡片', 'error')
            return
        }
        setChatSending(true)
        setHasTriggeredConversation(true)
        try {
            const result = await feynmanApi.followUp(currentCard.id)
            setChatMessages(
                result.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            )
        } catch {
            showSnackbar('追问出错，请稍后重试', 'error')
        } finally {
            setChatSending(false)
        }
    }

    const handleChatSend = async (message: string) => {
        if (!currentCard) return
        const userMsg: ChatMessage = { role: 'user', content: message }
        setChatMessages((prev) => [...prev, userMsg])
        setHasTriggeredConversation(true)
        setChatSending(true)
        try {
            const result = await feynmanApi.followUp(currentCard.id, message)
            setChatMessages(
                result.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            )
        } catch {
            showSnackbar('发送失败，请稍后重试', 'error')
        } finally {
            setChatSending(false)
        }
    }

    return (
        <Modal
            open={open}
            onCancel={onClose}
            onConfirm={handleSave}
            confirmLabel={saving ? '保存中...' : '保存'}
            isDisabled={saving || !summary || !example}
            isLoading={saving}
            title={isEditing ? '编辑心得卡' : '新建心得卡'}
            size="full">
            {loadingCard ? (
                <Loading />
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden">
                    {/* ===== Left: 编辑表单 ===== */}
                    <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-9rem)] p-3">
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
                                    {feynmanSubjectValues.map((s) => (
                                        <option key={s} value={s}>
                                            {feynmanSubjectLabels[s]}
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
                        <div className="bg-white rounded-xl border border-gray-200 p-5 ">
                            <EvaluationReport evaluation={evaluation} />
                        </div>

                        {/* Q1: Summary */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <div className="flex items-start justify-between mb-2">
                                <label className="text-sm font-bold text-gray-800">
                                    问题一：用一句话概括今天学到的核心知识
                                </label>
                                <span
                                    className={`text-xs ${
                                        summary.length > 30
                                            ? 'text-red-500'
                                            : 'text-gray-600'
                                    }`}>
                                    {summary.length}/30
                                </span>
                            </div>
                            <p className="text-xs text-gray-600 mb-3">
                                请用一句完整的话（不超过30个字）概括这节课最核心的概念、公式或规则
                            </p>
                            <textarea
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                placeholder="如：分数加减要先通分，然后分子相加减"
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
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
                                rows={4}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>

                        {/* Q3: Stuck Points */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                问题三：刚才哪里卡住了？
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                认真想一想，上面写概括或举例子时，哪一个点让你犹豫了、说不出了？请至少写一条
                            </p>
                            <textarea
                                value={stuckPoints}
                                onChange={(e) => setStuckPoints(e.target.value)}
                                placeholder="如：通分的时候不知道找最小公倍数还是直接乘分母"
                                rows={3}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                            />
                        </div>

                        {/* Memory Hook */}
                        <div className="bg-white rounded-xl border border-gray-200 p-5">
                            <label className="text-sm font-bold text-gray-800 mb-2 block">
                                选做：记忆钩子（复习锚点）
                            </label>
                            <p className="text-xs text-gray-600 mb-3">
                                如果明天我要复习，我只看自己写的哪句话就够了？
                            </p>
                            <textarea
                                value={memoryHook}
                                onChange={(e) => setMemoryHook(e.target.value)}
                                placeholder="把三个问题里最精练的那句话抄下来"
                                rows={2}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
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
                                emptyText={
                                    currentCard
                                        ? hasTriggeredConversation
                                            ? ''
                                            : '点击"追问"或输入问题与 AI 对话'
                                        : '请先保存卡片后再使用 AI 功能'
                                }
                                inputPlaceholder="输入你的问题...">
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleEvaluate}
                                        disabled={evaluating || !currentCard}
                                        className="btn btn-outline btn-sm">
                                        {evaluating ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="size-4" />
                                        )}
                                        <span className="ml-1">评估</span>
                                    </button>
                                    <button
                                        onClick={handleFollowUp}
                                        disabled={chatSending || !currentCard}
                                        className="btn btn-outline btn-sm">
                                        <MessageSquareText className="size-4" />
                                        <span className="ml-1">追问</span>
                                    </button>
                                </div>
                            </AiChatPanel>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    )
}
