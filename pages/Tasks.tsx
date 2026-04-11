import { useState, useEffect, useCallback } from 'react'
import { tasksApi } from '@apps/lib/api'
import type { Task, TaskType, AIScoreResult } from '@apps/lib/types'
import {
    taskTypeLabels,
    gradeColors,
    formatErrorMessage,
} from '@apps/lib/utils'
import { useSnackbar, ConfirmModal } from '@components/Snackbar'
import Modal from '@components/Modal'
import EditTask from '@/pages/layout/TaskEdit'
import Loading from '@/apps/components/Loading'
import ListTask from '@/pages/layout/TaskListTable'

export default function Tasks() {
    const { showSnackbar } = useSnackbar()
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)

    // Delete confirm
    const [deleteId, setDeleteId] = useState<number | null>(null)

    // Full-screen markdown editor
    const [editingTask, setEditingTask] = useState<Task | null>(null)

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
            showSnackbar('创建失败: ' + formatErrorMessage(err), 'error')
        }
    }

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
            showSnackbar('删除失败: ' + formatErrorMessage(err), 'error')
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
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setEditSaving(false)
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
            showSnackbar('AI评分失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setScoring(false)
        }
    }

    if (loading) {
        return <Loading />
    }

    // Full-screen Markdown editor for editing submission content
    if (editingTask) {
        return (
            <EditTask
                task={editingTask}
                onClose={() => {
                    setEditingTask(null)
                    loadTasks()
                }}
            />
        )
    }

    return (
        <>
            <ListTask
                tasks={tasks}
                onEdit={openEditModal}
                onEditContent={(task) => setEditingTask(task)}
                onScore={openScoreModal}
                onDelete={handleDelete}
                onAdd={() => setShowCreate(true)}
            />

            <Modal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                onSave={handleCreate}
                saveText="创建"
                title="新建作业">
                <div>
                    <label className="label">作业名称</label>
                    <textarea
                        className="input min-h-[80px] resize-y"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
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
                            setNewType(e.target.value as TaskType)
                        }>
                        {Object.entries(taskTypeLabels).map(([val, label]) => (
                            <option key={val} value={val}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
            </Modal>

            <Modal
                open={!!editTask}
                onClose={closeEditModal}
                onSave={handleEditSave}
                isSaving={editSaving}
                saveText="保存"
                title="编辑作业">
                <div>
                    <label className="label">作业名称</label>
                    <textarea
                        className="input min-h-[80px] resize-y"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
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
                            setEditType(e.target.value as TaskType)
                        }>
                        {Object.entries(taskTypeLabels).map(([val, label]) => (
                            <option key={val} value={val}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
            </Modal>

            <Modal
                open={!!scoreTask && !scoreResult}
                onClose={closeScoreModal}
                title="DeepSeek AI 评分"
                footer={
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
                }>
                <div className="text-sm text-gray-600">
                    作业：
                    <span className="font-medium text-gray-900">
                        {scoreTask?.title}
                    </span>
                    {scoreTask?.submission?.grade && (
                        <span className="ml-2 text-amber-600">
                            当前评分: {scoreTask.submission.grade}
                        </span>
                    )}
                </div>
                <p className="text-sm text-gray-500">
                    将使用 DeepSeek AI 对提交内容进行评分，自动计算积分。
                    {scoreTask?.submission?.grade && '将覆盖当前评分。'}
                </p>
            </Modal>

            <Modal
                open={!!scoreTask && !!scoreResult}
                onClose={closeScoreModal}
                title="评分结果"
                footer={
                    <div className="flex justify-end pt-2">
                        <button
                            onClick={closeScoreModal}
                            className="btn-primary">
                            确定
                        </button>
                    </div>
                }>
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-xs text-gray-500">等级</p>
                        <span
                            className={`badge ${scoreResult?.grade ? gradeColors[scoreResult.grade] : ''} text-lg px-3 py-1`}>
                            {scoreResult?.grade}
                        </span>
                    </div>
                    <div className="text-center">
                        <p className="text-xs text-gray-500">积分变化</p>
                        <p
                            className={`text-2xl font-bold ${scorePoints >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {scorePoints >= 0 ? '+' : ''}
                            {scorePoints}
                        </p>
                    </div>
                    {scoreResult?.score != null && scoreResult.score > 0 && (
                        <div className="text-center">
                            <p className="text-xs text-gray-500">AI评分</p>
                            <p className="text-2xl font-bold text-indigo-600">
                                {scoreResult.score}/100
                            </p>
                        </div>
                    )}
                </div>
                {scoreResult?.comment && (
                    <div>
                        <p className="text-sm font-medium text-gray-700">
                            评语
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                            {scoreResult.comment}
                        </p>
                    </div>
                )}
                {scoreResult?.suggestions &&
                    scoreResult.suggestions.length > 0 && (
                        <div>
                            <p className="text-sm font-medium text-gray-700">
                                改进建议
                            </p>
                            <ul className="text-sm text-gray-600 list-disc list-inside mt-1">
                                {scoreResult.suggestions.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
            </Modal>

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
