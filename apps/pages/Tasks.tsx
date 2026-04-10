import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import MDEditor from '@uiw/react-md-editor'
import mermaid from 'mermaid'
import { Sparkles, Loader2, Check, X } from 'lucide-react'
import { tasksApi, configApi } from '../lib/api'
import type { Task, TaskType, AIScoreResult } from '../lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
    taskStatusLabels,
    gradeColors,
} from '../lib/utils'
import { useSnackbar, ConfirmModal } from '../components/Snackbar'

function formatDateTime(iso: string | null): string {
    if (!iso) return '-'
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    })
}

const PAGE_SIZE = 20

export default function Tasks() {
    const { showSnackbar } = useSnackbar()
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [page, setPage] = useState(1)

    // Delete confirm
    const [deleteId, setDeleteId] = useState<number | null>(null)

    // Full-screen markdown editor state (for editing submission content)
    const [editingTask, setEditingTask] = useState<Task | null>(null)
    const [mdContent, setMdContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [autosaveStatus, setAutosaveStatus] = useState<
        'idle' | 'saving' | 'saved'
    >('idle')
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastSavedContentRef = useRef<string>('')
    const autosaveIntervalRef = useRef<number>(10) // default 10s
    const editingTaskIdRef = useRef<number | null>(null)

    // AI Score modal state
    const [scoreTask, setScoreTask] = useState<Task | null>(null)
    const [scoring, setScoring] = useState(false)
    const [scoreResult, setScoreResult] = useState<AIScoreResult | null>(null)
    const [scorePoints, setScorePoints] = useState<number>(0)

    // Create form
    const [newTitle, setNewTitle] = useState('')
    const [newType, setNewType] = useState<TaskType>('composition')

    // Edit task detail state (title, type)
    const [editTask, setEditTask] = useState<Task | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editType, setEditType] = useState<TaskType>('composition')
    const [editSaving, setEditSaving] = useState(false)
    const [generatingTitle, setGeneratingTitle] = useState(false)

    // Fetch autosave config on mount
    useEffect(() => {
        configApi
            .get()
            .then((cfg) => {
                autosaveIntervalRef.current = cfg.autosaveInterval
            })
            .catch(() => {
                // fallback to default 10s
            })
    }, [])

    const loadTasks = useCallback(async () => {
        try {
            const data = await tasksApi.list()
            setTasks(data)
        } catch (err) {
            console.error('Failed to load tasks:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadTasks()
    }, [loadTasks])

    const handleCreate = async () => {
        const title =
            newTitle.trim() ||
            (newType === 'composition'
                ? '未命名作文作业'
                : '未命名思维导图作业')
        try {
            await tasksApi.create({
                title,
                type: newType,
            })
            setShowCreate(false)
            setNewTitle('')
            setNewType('composition')
            showSnackbar('作业创建成功')
            loadTasks()
        } catch (err) {
            showSnackbar(
                '创建失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        }
    }

    // Open content editor (for editing submission content)
    const openEditor = (task: Task) => {
        setEditingTask(task)
        editingTaskIdRef.current = task.id
        const content = task.submission?.content ?? ''
        setMdContent(content)
        lastSavedContentRef.current = content
        setLastSaved(null)
        setAutosaveStatus('idle')
    }

    const closeEditor = () => {
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
            autosaveTimerRef.current = null
        }
        setEditingTask(null)
        editingTaskIdRef.current = null
        setMdContent('')
        lastSavedContentRef.current = ''
        setLastSaved(null)
        setAutosaveStatus('idle')
    }

    const doSave = useCallback(
        async (content: string) => {
            if (!editingTask || !content.trim()) return
            // Guard against stale closure: skip if user has switched tasks
            if (editingTaskIdRef.current !== editingTask.id) return
            setAutosaveStatus('saving')
            try {
                await tasksApi.submit(editingTask.id, {
                    content: content.trim(),
                })
                // Double-check task hasn't changed during the async operation
                if (editingTaskIdRef.current !== editingTask.id) return
                lastSavedContentRef.current = content
                setLastSaved(new Date())
                setAutosaveStatus('saved')
            } catch {
                setAutosaveStatus('idle')
            }
        },
        [editingTask],
    )

    // Manual save (close after save)
    const handleSave = async () => {
        if (!editingTask || !mdContent.trim()) return
        // Clear pending autosave to prevent duplicate request
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
            autosaveTimerRef.current = null
        }
        setSaving(true)
        try {
            await tasksApi.submit(editingTask.id, {
                content: mdContent.trim(),
            })
            showSnackbar('保存成功')
            closeEditor()
            loadTasks()
        } catch (err) {
            showSnackbar(
                '保存失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setSaving(false)
        }
    }

    // Autosave effect: trigger on content change, debounce
    useEffect(() => {
        if (!editingTask) return
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
        }
        // Only autosave if content changed from last saved
        if (mdContent === lastSavedContentRef.current) return
        autosaveTimerRef.current = setTimeout(() => {
            doSave(mdContent)
        }, autosaveIntervalRef.current * 1000)
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
            }
        }
    }, [editingTask, mdContent, doSave])

    const handleDelete = (id: number) => {
        setDeleteId(id)
    }

    const confirmDelete = async () => {
        if (deleteId === null) return
        try {
            await tasksApi.delete(deleteId)
            showSnackbar('删除成功')
            loadTasks()
        } catch (err) {
            showSnackbar(
                '删除失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setDeleteId(null)
        }
    }

    // Open edit task detail modal (click on task name)
    const openEditModal = (task: Task) => {
        setEditTask(task)
        setEditTitle(task.title)
        setEditType(task.type)
        setEditSaving(false)
    }

    const closeEditModal = () => {
        setEditTask(null)
        setEditTitle('')
        setEditType('composition')
    }

    const handleEditSave = async () => {
        if (!editTask || !editTitle.trim()) return
        setEditSaving(true)
        try {
            await tasksApi.update(editTask.id, {
                title: editTitle.trim(),
                type: editType,
            })
            showSnackbar('保存成功')
            closeEditModal()
            loadTasks()
        } catch (err) {
            showSnackbar(
                '保存失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setEditSaving(false)
        }
    }

    // AI generate title based on submission content
    const handleAiTitle = async () => {
        if (!editingTask) return
        setGeneratingTitle(true)
        try {
            const res = await tasksApi.aiTitle(editingTask.id)
            setEditingTask({ ...editingTask, title: res.title })
            showSnackbar('AI起名成功')
            loadTasks()
        } catch (err) {
            showSnackbar(
                'AI起名失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setGeneratingTitle(false)
        }
    }

    // Open AI score modal
    const openScoreModal = (task: Task) => {
        setScoreTask(task)
        setScoring(false)
        setScoreResult(null)
        setScorePoints(0)
    }

    const closeScoreModal = () => {
        setScoreTask(null)
        setScoring(false)
        setScoreResult(null)
        setScorePoints(0)
    }

    // Handle AI scoring
    const handleAiScore = async () => {
        if (!scoreTask) return
        setScoring(true)
        try {
            const res = await tasksApi.aiScore(scoreTask.id)
            setScoreResult(res.aiResult)
            setScorePoints(res.pointsEarned)
            showSnackbar('AI评分完成')
            loadTasks()
        } catch (err) {
            showSnackbar(
                'AI评分失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setScoring(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">加载中...</div>
            </div>
        )
    }

    const totalPages = Math.max(1, Math.ceil(tasks.length / PAGE_SIZE))
    const pagedTasks = tasks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    // Autosave status text
    const autosaveText =
        autosaveStatus === 'saving'
            ? '自动保存中...'
            : lastSaved
              ? `已自动保存 ${lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : '未保存'

    // Full-screen Markdown editor for editing submission content
    if (editingTask) {
        const hasSuggestions =
            editingTask.aiSuggestions && editingTask.aiSuggestions.length > 0
        return (
            <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
                <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <span
                            className={`badge ${taskTypeColors[editingTask.type]}`}>
                            {taskTypeLabels[editingTask.type]}
                        </span>
                        <h2 className="text-sm font-normal text-gray-900">
                            {editingTask.title}
                        </h2>
                        {editingTask.title.startsWith('未命名') && (
                            <button
                                onClick={handleAiTitle}
                                disabled={generatingTitle}
                                className="btn-outline">
                                {generatingTitle ? 'AI起名中...' : 'AI起名'}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={closeEditor} className="btn-outline">
                            取消
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn-primary">
                            {saving ? '保存中...' : '保存并关闭'}
                        </button>
                    </div>
                </div>

                {/* AI 改进建议 */}
                {hasSuggestions && (
                    <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex-shrink-0">
                        <div className="flex items-start gap-2">
                            <Sparkles className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm font-medium text-amber-800">
                                    改进建议
                                </p>
                                <ul className="text-sm text-amber-700 list-disc list-inside mt-1">
                                    {editingTask.aiSuggestions.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-hidden" data-color-mode="light">
                    <MDEditor
                        value={mdContent}
                        onChange={(val: string) => setMdContent(val ?? '')}
                        height="100%"
                        preview="live"
                        hideToolbar={false}
                        previewOptions={mdEditorPreviewOptions}
                    />
                </div>

                <div className="bg-gray-100 border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <span>{mdContent.length} 字符</span>
                        <span
                            className={`flex items-center gap-1 ${autosaveStatus === 'saving' ? 'text-amber-500' : autosaveStatus === 'saved' ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {autosaveStatus === 'saving' && (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            )}
                            {autosaveStatus === 'saved' && (
                                <Check className="w-3 h-3" />
                            )}
                        </span>
                    </div>
                    <span>{autosaveText}</span>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">
                        作业管理
                    </h2>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn-primary">
                        添加作业
                    </button>
                </div>

                {/* Tasks Table */}
                <div className="card overflow-hidden !p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    名称
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    类型
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    评分等级
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    评语
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    积分
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    状态
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    提交时间
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    评分时间
                                </th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">
                                    操作
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={9}
                                        className="py-8 text-center text-gray-400">
                                        暂无作业
                                    </td>
                                </tr>
                            ) : (
                                pagedTasks.map((task) => (
                                    <tr
                                        key={task.id}
                                        className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <button
                                                onClick={() =>
                                                    openEditModal(task)
                                                }
                                                className="font-medium text-gray-900 hover:text-indigo-600 hover:underline text-left">
                                                {task.title}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className={`badge ${taskTypeColors[task.type]}`}>
                                                {taskTypeLabels[task.type]}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4">
                                            {task.submission?.grade ? (
                                                <span
                                                    className={`badge ${gradeColors[task.submission.grade]}`}>
                                                    {task.submission.grade}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">
                                                    -
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 max-w-[240px] whitespace-pre-line break-words text-xs leading-relaxed">
                                            {task.aiComment || (
                                                <span className="text-gray-400">
                                                    -
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {task.pointsEarned !== null ? (
                                                <span
                                                    className={
                                                        task.pointsEarned >= 0
                                                            ? 'text-emerald-600 font-medium'
                                                            : 'text-red-600 font-medium'
                                                    }>
                                                    {task.pointsEarned >= 0
                                                        ? '+'
                                                        : ''}
                                                    {task.pointsEarned}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">
                                                    -
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className={`badge-${task.status}`}>
                                                {taskStatusLabels[task.status]}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 text-xs">
                                            {formatDateTime(task.submittedAt)}
                                        </td>
                                        <td className="py-3 px-4 text-gray-600 text-xs">
                                            {formatDateTime(task.gradedAt)}
                                        </td>
                                        <td className="py-3 px-4 text-right space-x-2">
                                            <button
                                                onClick={() => openEditor(task)}
                                                className="btn-outline btn-sm">
                                                编辑
                                            </button>
                                            <button
                                                onClick={() =>
                                                    openScoreModal(task)
                                                }
                                                className="btn-primary btn-sm">
                                                AI评分
                                            </button>
                                            <button
                                                onClick={() =>
                                                    handleDelete(task.id)
                                                }
                                                className="btn-danger btn-sm">
                                                删除
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    {tasks.length > PAGE_SIZE && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                            <p className="text-sm text-gray-500">
                                共 {tasks.length} 条，第 {page}/{totalPages} 页
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={page <= 1}
                                    className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                    上一页
                                </button>
                                <button
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(totalPages, p + 1),
                                        )
                                    }
                                    disabled={page >= totalPages}
                                    className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                    下一页
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showCreate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowCreate(false)}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    新建作业
                                </h3>
                                <button
                                    onClick={() => setShowCreate(false)}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="label">作业名称</label>
                                    <textarea
                                        className="input min-h-[80px] resize-y"
                                        value={newTitle}
                                        onChange={(e) =>
                                            setNewTitle(e.target.value)
                                        }
                                        placeholder="请输入作业名称"
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <label className="label">作业类型</label>
                                    <select
                                        className="input"
                                        value={newType}
                                        onChange={(e) =>
                                            setNewType(
                                                e.target.value as TaskType,
                                            )
                                        }>
                                        {Object.entries(taskTypeLabels).map(
                                            ([val, label]) => (
                                                <option key={val} value={val}>
                                                    {label}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setShowCreate(false)}
                                        className="btn-outline">
                                        取消
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        className="btn-primary">
                                        创建
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Task Detail Modal (click task name) */}
            {editTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeEditModal}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    编辑作业
                                </h3>
                                <button
                                    onClick={closeEditModal}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="label">作业名称</label>
                                    <textarea
                                        className="input min-h-[80px] resize-y"
                                        value={editTitle}
                                        onChange={(e) =>
                                            setEditTitle(e.target.value)
                                        }
                                        placeholder="请输入作业名称"
                                        rows={3}
                                    />
                                </div>
                                <div>
                                    <label className="label">作业类型</label>
                                    <select
                                        className="input"
                                        value={editType}
                                        onChange={(e) =>
                                            setEditType(
                                                e.target.value as TaskType,
                                            )
                                        }>
                                        {Object.entries(taskTypeLabels).map(
                                            ([val, label]) => (
                                                <option key={val} value={val}>
                                                    {label}
                                                </option>
                                            ),
                                        )}
                                    </select>
                                </div>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={closeEditModal}
                                        className="btn-outline">
                                        取消
                                    </button>
                                    <button
                                        onClick={handleEditSave}
                                        disabled={editSaving}
                                        className="btn-primary">
                                        {editSaving ? '保存中...' : '保存'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Score Modal */}
            {scoreTask && !scoreResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeScoreModal}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    DeepSeek AI 评分
                                </h3>
                                <button
                                    onClick={closeScoreModal}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="text-sm text-gray-600">
                                    作业：
                                    <span className="font-medium text-gray-900">
                                        {scoreTask.title}
                                    </span>
                                    {scoreTask.submission?.grade && (
                                        <span className="ml-2 text-amber-600">
                                            当前评分:{' '}
                                            {scoreTask.submission.grade}
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-gray-500">
                                    将使用 DeepSeek AI
                                    对提交内容进行评分，自动计算积分。
                                    {scoreTask.submission?.grade &&
                                        '将覆盖当前评分。'}
                                </p>
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={closeScoreModal}
                                        className="btn-outline">
                                        取消
                                    </button>
                                    <button
                                        onClick={handleAiScore}
                                        disabled={scoring}
                                        className="btn-primary">
                                        {scoring ? 'AI评分中...' : '开始AI评分'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Score Result Modal */}
            {scoreTask && scoreResult && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={closeScoreModal}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    评分结果
                                </h3>
                                <button
                                    onClick={closeScoreModal}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center gap-6">
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500">
                                            等级
                                        </p>
                                        <span
                                            className={`badge ${gradeColors[scoreResult.grade]} text-lg px-3 py-1`}>
                                            {scoreResult.grade}
                                        </span>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs text-gray-500">
                                            积分变化
                                        </p>
                                        <p
                                            className={`text-2xl font-bold ${scorePoints >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {scorePoints >= 0 ? '+' : ''}
                                            {scorePoints}
                                        </p>
                                    </div>
                                    {scoreResult.score > 0 && (
                                        <div className="text-center">
                                            <p className="text-xs text-gray-500">
                                                AI评分
                                            </p>
                                            <p className="text-2xl font-bold text-indigo-600">
                                                {scoreResult.score}/100
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {scoreResult.comment && (
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">
                                            评语
                                        </p>
                                        <p className="text-sm text-gray-600 mt-1">
                                            {scoreResult.comment}
                                        </p>
                                    </div>
                                )}
                                {scoreResult.suggestions &&
                                    scoreResult.suggestions.length > 0 && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-700">
                                                改进建议
                                            </p>
                                            <ul className="text-sm text-gray-600 list-disc list-inside mt-1">
                                                {scoreResult.suggestions.map(
                                                    (s, i) => (
                                                        <li key={i}>{s}</li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>
                                    )}
                                <div className="flex justify-end pt-2">
                                    <button
                                        onClick={closeScoreModal}
                                        className="btn-primary">
                                        确定
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                open={deleteId !== null}
                title="删除作业"
                message="确定删除此作业？删除后不可恢复。"
                confirmLabel="删除"
                danger
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}
            />
        </>
    )
}

// ===== Mermaid support for MDEditor preview =====
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
})

// Monotonic counter for unique mermaid render IDs
let mermaidRenderCounter = 0

// Sanitize SVG: strip event handlers and dangerous elements to prevent XSS
function sanitizeSvg(svg: string): string {
    return svg
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
}

// Mermaid code block renderer for MDEditor preview (memoized to avoid re-renders)
const MermaidCodeBlock = memo(function MermaidCodeBlock({
    code,
}: {
    code: string
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        if (!containerRef.current) return
        const id = `mermaid-${++mermaidRenderCounter}`
        mermaid
            .render(id, code)
            .then(({ svg }: { svg: string }) => {
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = sanitizeSvg(svg)
                    setError(null)
                }
            })
            .catch((err: Error) => {
                if (!cancelled) setError(err.message || '渲染失败')
            })
        return () => {
            cancelled = true
        }
    }, [code])

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600 my-2">
                <p className="font-medium">思维导图渲染失败</p>
                <p className="text-xs mt-1">{error}</p>
                <pre className="text-xs mt-2 bg-red-100 p-2 rounded overflow-x-auto">
                    {code}
                </pre>
            </div>
        )
    }

    return <div ref={containerRef} className="my-2 overflow-x-auto" />
})

// Custom code component for MDEditor preview to render mermaid blocks (memoized)
// In react-markdown v10, code blocks render as <pre><code className="language-xxx ...">...</code></pre>
// rehype-prism-plus adds "code-highlight" to className, so className may be "language-mermaid code-highlight"
const MdCodeBlock = memo(function MdCodeBlock({
    className,
    children,
    node,
    ...props
}: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
    const code = useMemo(
        () => extractText(children).replace(/\n$/, ''),
        [children],
    )
    const lang = useMemo(() => {
        const classList = className?.split(/\s+/) ?? []
        const langClass = classList.find((c) => c.startsWith('language-'))
        return langClass?.replace('language-', '')
    }, [className])

    if (lang === 'mermaid') {
        return <MermaidCodeBlock code={code} />
    }
    return (
        <code className={className} {...props}>
            {children}
        </code>
    )
})

// Helper: extract plain text from React children (strings, numbers, element trees)
// Handles: string, number, arrays, React elements with nested children
// Ignores: null, undefined, boolean (same as React rendering behavior)
function extractText(children: React.ReactNode): string {
    if (children == null || typeof children === 'boolean') return ''
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (Array.isArray(children)) return children.map(extractText).join('')
    if (typeof children === 'object' && 'props' in children) {
        const el = children as React.ReactElement<{
            children?: React.ReactNode
        }>
        return extractText(el.props.children)
    }
    return ''
}

// Preview options for MDEditor with mermaid support
const mdEditorPreviewOptions = {
    components: { code: MdCodeBlock },
}
