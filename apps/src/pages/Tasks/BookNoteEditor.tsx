'use client'

import { Loader2, Check, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { tasksApi, systemAPI } from '@apps/utils/api'
import {
    taskTypeColors,
    taskTypeLabels,
    formatErrorMessage,
} from '@apps/utils/client'
import AiChatPanel from '@components/AiChatPanel'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import type { ChatMessage, Task } from '@shared/types'

interface BookNoteData {
    bookInfo: {
        bookName: string
        chapter: string
        author: string
    }
    goodWords: string
    excerpts: Array<{
        sentence: string
        insight: string
    }>
    reflection: {
        mainContent: string
        thoughts: string
    }
}

const DEFAULT_DATA: BookNoteData = {
    bookInfo: { bookName: '', chapter: '', author: '' },
    goodWords: '',
    excerpts: [],
    reflection: { mainContent: '', thoughts: '' },
}

interface BookNoteEditorProps {
    task: Task
    onCancel: () => void
}

export function BookNoteEditor({ task, onCancel }: BookNoteEditorProps) {
    const { showSnackbar } = useSnackbar()
    const [data, setData] = useState<BookNoteData>(DEFAULT_DATA)
    const [title, setTitle] = useState(task.title)
    const [saving, setSaving] = useState(false)
    const [showExcerptDialog, setShowExcerptDialog] = useState(false)
    const [editExcerptIdx, setEditExcerptIdx] = useState<number | null>(null)
    const [excerptSentence, setExcerptSentence] = useState('')
    const [excerptInsight, setExcerptInsight] = useState('')
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
    const [chatting, setChatting] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [autosaveStatus, setAutosaveStatus] = useState<
        'idle' | 'saving' | 'saved' | 'error'
    >('idle')
    const lastSavedContentRef = useRef('')
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const autosaveIntervalRef = useRef<number>(30)

    // Load conversation history on mount
    useEffect(() => {
        tasksApi
            .getConversation(task.id)
            .then((res) => {
                setChatMessages(res.messages)
            })
            .catch(() => {
                // No conversation yet
            })
    }, [task.id])

    useEffect(() => {
        if (task.submission?.content) {
            try {
                const raw = JSON.parse(task.submission.content) as Record<
                    string,
                    unknown
                >
                setData({
                    bookInfo: {
                        bookName: '',
                        chapter: '',
                        author: '',
                        ...(typeof raw.bookInfo === 'object' && raw.bookInfo
                            ? (raw.bookInfo as Record<string, string>)
                            : {}),
                    },
                    goodWords:
                        typeof raw.goodWords === 'string' ? raw.goodWords : '',
                    excerpts: Array.isArray(raw.excerpts)
                        ? (raw.excerpts as Array<{
                              sentence: string
                              insight: string
                          }>)
                        : [],
                    reflection: {
                        mainContent: '',
                        thoughts: '',
                        ...(typeof raw.reflection === 'object' && raw.reflection
                            ? (raw.reflection as Record<string, string>)
                            : {}),
                    },
                })
            } catch {
                // fallback to default
            }
        }
    }, [task.submission?.content])

    // Fetch autosave config on mount
    useEffect(() => {
        systemAPI
            .get()
            .then((cfg) => {
                const interval = Number(cfg.autosaveInterval)
                if (Number.isFinite(interval) && interval > 0) {
                    autosaveIntervalRef.current = interval
                }
            })
            .catch((err) => {
                console.warn(
                    '[BookNoteEditor] Failed to load autosave config, using default 30s:',
                    err,
                )
            })
    }, [])

    const doSave = useCallback(
        async (json: string) => {
            if (!json.trim()) return
            setAutosaveStatus('saving')
            try {
                // Rename title if book info is complete
                const parsed = JSON.parse(json) as BookNoteData
                const { bookName, chapter, author } = parsed.bookInfo
                if (bookName?.trim() && chapter?.trim() && author?.trim()) {
                    const newTitle = `${author.trim()}：《${bookName.trim()}》${chapter.trim()}读后感`
                    await tasksApi.update(task.id, { title: newTitle })
                    setTitle(newTitle)
                }
                await tasksApi.submit(task.id, { content: json })
                lastSavedContentRef.current = json
                setLastSaved(new Date())
                setAutosaveStatus('saved')
            } catch {
                setAutosaveStatus('error')
            }
        },
        [task.id],
    )

    // Autosave effect: debounce data changes
    useEffect(() => {
        const { bookName, chapter, author } = data.bookInfo
        if (!bookName.trim() || !chapter.trim() || !author.trim()) return
        const json = JSON.stringify(data)
        if (json === lastSavedContentRef.current) return
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
        }
        if (autosaveStatus === 'saved') {
            setAutosaveStatus('idle')
        }
        autosaveTimerRef.current = setTimeout(() => {
            doSave(json)
        }, autosaveIntervalRef.current * 1000)
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
            }
        }
    }, [data, doSave, autosaveStatus])

    // Cleanup timer on unmount
    useEffect(() => {
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
            }
        }
    }, [])

    const updateBookInfo = (
        field: keyof BookNoteData['bookInfo'],
        value: string,
    ) => {
        setData((prev) => ({
            ...prev,
            bookInfo: { ...prev.bookInfo, [field]: value },
        }))
    }

    const updateReflection = (
        field: keyof BookNoteData['reflection'],
        value: string,
    ) => {
        setData((prev) => ({
            ...prev,
            reflection: { ...prev.reflection, [field]: value },
        }))
    }

    const openAddExcerpt = () => {
        setEditExcerptIdx(null)
        setExcerptSentence('')
        setExcerptInsight('')
        setShowExcerptDialog(true)
    }

    const openEditExcerpt = (idx: number) => {
        setEditExcerptIdx(idx)
        setExcerptSentence(data.excerpts[idx].sentence)
        setExcerptInsight(data.excerpts[idx].insight)
        setShowExcerptDialog(true)
    }

    const closeExcerptDialog = () => {
        setShowExcerptDialog(false)
    }

    const saveExcerpt = () => {
        if (!excerptSentence.trim() || !excerptInsight.trim()) {
            showSnackbar('摘抄句子和赏析不能为空', 'error')
            return
        }
        setData((prev) => {
            const excerpts = [...prev.excerpts]
            if (editExcerptIdx !== null) {
                excerpts[editExcerptIdx] = {
                    sentence: excerptSentence.trim(),
                    insight: excerptInsight.trim(),
                }
            } else {
                excerpts.push({
                    sentence: excerptSentence.trim(),
                    insight: excerptInsight.trim(),
                })
            }
            return { ...prev, excerpts }
        })
        setShowExcerptDialog(false)
    }

    const deleteExcerpt = (idx: number) => {
        setData((prev) => ({
            ...prev,
            excerpts: prev.excerpts.filter((_, i) => i !== idx),
        }))
    }

    const handleSave = async () => {
        const { bookName, chapter, author } = data.bookInfo
        if (!bookName.trim() || !chapter.trim() || !author.trim()) {
            showSnackbar('请填写完整的书籍信息（书名、篇目、作者）', 'error')
            return
        }
        setSaving(true)
        try {
            await doSave(JSON.stringify(data))
            showSnackbar('保存成功')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleChatSend = async (message: string) => {
        const userMsg: ChatMessage = { role: 'user', content: message }
        setChatMessages((prev) => [...prev, userMsg])
        setChatting(true)
        try {
            await tasksApi.aiChat(task.id, message)
            const conv = await tasksApi.getConversation(task.id)
            setChatMessages(conv.messages)
        } catch (err) {
            showSnackbar('AI对话失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setChatting(false)
        }
    }

    const aiSuggestions = task.aiSuggestions
    const hasSuggestions = aiSuggestions && aiSuggestions.length > 0

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <span className={`badge ${taskTypeColors[task.type]}`}>
                        {taskTypeLabels[task.type]}
                    </span>
                    <h2 className="text-sm font-normal text-gray-900">
                        {title}
                    </h2>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="btn btn-outline">
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn btn-primary">
                        {saving ? '保存中...' : '保存'}
                    </button>
                </div>
            </div>

            {/* Body - left form + right AI chat */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-3">
                    {/* AI 改进建议 */}
                    {hasSuggestions && (
                        <div className="bg-amber-50 border-b border-warning-background px-6 py-3 shrink-0">
                            <div className="flex items-start gap-2">
                                <Sparkles className="size-5 text-warning shrink-0" />
                                <div className="space-y-1 text-sm font-medium text-warning">
                                    <h6 className="text-warning">改进建议</h6>
                                    <ul className="list-disc list-inside">
                                        {aiSuggestions.map((s, i) => (
                                            <li key={i}>{s}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    <BookNoteForm
                        data={data}
                        setData={setData}
                        updateBookInfo={updateBookInfo}
                        updateReflection={updateReflection}
                        openAddExcerpt={openAddExcerpt}
                        openEditExcerpt={openEditExcerpt}
                        deleteExcerpt={deleteExcerpt}
                    />
                </div>
                <div className="w-md flex flex-col overflow-hidden">
                    <AiChatPanel
                        messages={chatMessages}
                        onSend={handleChatSend}
                        sending={chatting}
                        aiHelperName="小老师"
                    />
                </div>
            </div>

            {/* Autosave status bar */}
            <div className="bg-gray-100 border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500 shrink-0">
                <div className="flex items-center gap-4">
                    <span>{JSON.stringify(data).length} 字符</span>
                    <span
                        className={`flex items-center gap-1 ${autosaveStatus === 'saving' ? 'text-warning' : autosaveStatus === 'saved' ? 'text-success' : autosaveStatus === 'error' ? 'text-danger' : 'text-muted'}`}>
                        {autosaveStatus === 'saving' && (
                            <Loader2 className="size-4 animate-spin" />
                        )}
                        {autosaveStatus === 'saved' && (
                            <Check className="size-4" />
                        )}
                    </span>
                </div>
                <span>
                    {autosaveStatus === 'saving'
                        ? '自动保存中...'
                        : autosaveStatus === 'error'
                          ? '自动保存失败'
                          : lastSaved
                            ? `已自动保存 ${lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                            : '未保存'}
                </span>
            </div>

            {/* Excerpt Dialog */}
            <Modal
                open={showExcerptDialog}
                title={editExcerptIdx !== null ? '编辑摘抄' : '添加摘抄'}
                confirmLabel={editExcerptIdx !== null ? '保存' : '添加'}
                onConfirm={saveExcerpt}
                onCancel={closeExcerptDialog}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-base font-light mb-1">
                            摘抄句子
                        </label>
                        <textarea
                            value={excerptSentence}
                            onChange={(e) => setExcerptSentence(e.target.value)}
                            className="regular-text"
                            placeholder="摘抄原文中的精彩句子"
                            rows={3}
                        />
                    </div>
                    <div>
                        <label className="block text-base font-light mb-1">
                            赏析
                        </label>
                        <textarea
                            value={excerptInsight}
                            onChange={(e) => setExcerptInsight(e.target.value)}
                            className="regular-text"
                            placeholder="写下你对这句话的理解和赏析"
                            rows={3}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    )
}

// ===== BookNoteForm: 读书笔记表单区域 =====

interface BookNoteFormProps {
    data: BookNoteData
    setData: React.Dispatch<React.SetStateAction<BookNoteData>>
    updateBookInfo: (
        field: keyof BookNoteData['bookInfo'],
        value: string,
    ) => void
    updateReflection: (
        field: keyof BookNoteData['reflection'],
        value: string,
    ) => void
    openAddExcerpt: () => void
    openEditExcerpt: (idx: number) => void
    deleteExcerpt: (idx: number) => void
}

function BookNoteForm({
    data,
    setData,
    updateBookInfo,
    updateReflection,
    openAddExcerpt,
    openEditExcerpt,
    deleteExcerpt,
}: BookNoteFormProps) {
    return (
        <div className="flex-1 p-6 space-y-6 w-full">
            {/* 书籍信息 */}
            <section className="card">
                <h3 className="text-base font-light mb-4">书籍信息</h3>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 items-center text-sm">
                    <label className="text-muted text-right">书名</label>
                    <input
                        type="text"
                        value={data.bookInfo.bookName}
                        onChange={(e) =>
                            updateBookInfo('bookName', e.target.value)
                        }
                        className="regular-text"
                        placeholder="请输入书名"
                    />
                    <label className="text-muted text-right">篇目</label>
                    <input
                        type="text"
                        value={data.bookInfo.chapter}
                        onChange={(e) =>
                            updateBookInfo('chapter', e.target.value)
                        }
                        className="regular-text"
                        placeholder="可填写具体篇目或章节"
                    />
                    <label className="text-muted text-right">作者</label>
                    <input
                        type="text"
                        value={data.bookInfo.author}
                        onChange={(e) =>
                            updateBookInfo('author', e.target.value)
                        }
                        className="regular-text"
                        placeholder="请输入作者"
                    />
                </div>
            </section>

            {/* 累积好词 */}
            <section className="card">
                <h3 className="text-base font-light mb-4">累积好词</h3>
                <textarea
                    value={data.goodWords}
                    onChange={(e) => {
                        const value = e.target.value
                        setData((prev) => ({
                            ...prev,
                            goodWords: value,
                        }))
                    }}
                    className="regular-text"
                    placeholder={
                        '每行一个词语，如：\n如锦似绣\n富丽堂皇\n热火朝天'
                    }
                    rows={5}
                />
                <p className="text-xs text-muted mt-1">
                    每行输入一个词语，便于积累和统计
                </p>
            </section>

            {/* 摘抄赏析 */}
            <section className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-light">摘抄赏析</h3>
                    <button
                        onClick={openAddExcerpt}
                        className="btn btn-outline btn-sm">
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        添加
                    </button>
                </div>
                {data.excerpts.length === 0 ? (
                    <p className="text-sm text-muted">
                        暂无摘抄，点击「添加」开始记录
                    </p>
                ) : (
                    <div className="space-y-3">
                        {data.excerpts.map((excerpt, idx) => (
                            <div
                                key={idx}
                                className="border border-gray-200 rounded-lg p-3 relative group">
                                <button
                                    onClick={() => deleteExcerpt(idx)}
                                    className="absolute top-2 right-2 text-danger/70 hover:text-danger cursor-pointer">
                                    <Trash2 className="size-4" />
                                </button>
                                <div className="text-sm pr-6">
                                    <div className="mb-1">
                                        <span className="text-muted text-xs">
                                            摘抄：
                                        </span>
                                        <span
                                            className="text-headline cursor-pointer hover:text-primary"
                                            onClick={() =>
                                                openEditExcerpt(idx)
                                            }>
                                            {excerpt.sentence}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-muted text-xs">
                                            赏析：
                                        </span>
                                        <span
                                            className="text-gray-700 cursor-pointer hover:text-primary"
                                            onClick={() =>
                                                openEditExcerpt(idx)
                                            }>
                                            {excerpt.insight}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* 写读后感 */}
            <section className="card">
                <h3 className="text-base font-light mb-4">写读后感</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-muted mb-1">
                            主要内容
                        </label>
                        <textarea
                            value={data.reflection.mainContent}
                            onChange={(e) =>
                                updateReflection('mainContent', e.target.value)
                            }
                            className="regular-text"
                            placeholder="用几句话概括这本书或这篇文章的主要内容"
                            rows={3}
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-muted mb-1">
                            我的感想
                        </label>
                        <textarea
                            value={data.reflection.thoughts}
                            onChange={(e) =>
                                updateReflection('thoughts', e.target.value)
                            }
                            className="regular-text"
                            placeholder="写下你的读后感、收获或启发"
                            rows={3}
                        />
                    </div>
                </div>
            </section>
        </div>
    )
}
