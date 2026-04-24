import { useState, useEffect, useCallback } from 'react'
import { tasksApi } from '@apps/lib/api'
import type { Task, TaskType, AIScoreResult } from '@apps/lib/types'
import { formatErrorMessage, taskTypeDefaultTitles } from '@apps/lib/utils'
import { useSnackbar } from '@components/Snackbar'
import Modal from '@apps/components/Modal'
import Loading from '@apps/components/Loading'
import ListTask from '@pages/layout/TaskListTable'
import EditTask from '@pages/layout/TaskEdit'
import TaskModalCreate from '@pages/layout/TaskModalCreate'
import TaskModalEdit from '@pages/layout/TaskModalEdit'
import TaskModalAIScore from '@pages/layout/TaskModalAIScore'
import TaskModalAIResult from '@pages/layout/TaskModalAIResult'

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

    // Edit task detail state
    const [editTask, setEditTask] = useState<Task | null>(null)
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

    const handleCreate = async (title: string, type: TaskType) => {
        const resolvedTitle = title || taskTypeDefaultTitles[type]
        try {
            await tasksApi.create({ title: resolvedTitle, type })
            setShowCreate(false)
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
        setEditSaving(false)
    }

    const closeEditModal = () => {
        setEditTask(null)
    }

    const handleEditSave = async (title: string, type: TaskType) => {
        if (!editTask || !title) return
        setEditSaving(true)
        try {
            await tasksApi.update(editTask.id, { title, type })
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
                onCancel={() => {
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

            <TaskModalCreate
                open={showCreate}
                onCancel={() => setShowCreate(false)}
                onConfirm={handleCreate}
            />

            <TaskModalEdit
                open={!!editTask}
                task={editTask}
                onCancel={closeEditModal}
                onConfirm={handleEditSave}
                isLoading={editSaving}
            />

            <TaskModalAIScore
                open={!!scoreTask && !scoreResult}
                task={scoreTask}
                scoring={scoring}
                onCancel={closeScoreModal}
                onScore={handleAiScore}
            />

            <TaskModalAIResult
                open={!!scoreTask && !!scoreResult}
                task={scoreTask}
                result={scoreResult}
                points={scorePoints}
                onCancel={closeScoreModal}
            />

            <Modal
                open={deleteId !== null}
                title="删除作业"
                confirmLabel="删除"
                danger
                onConfirm={confirmDelete}
                onCancel={() => setDeleteId(null)}>
                <p className="text-sm text-gray-600">
                    确定删除此作业？删除后不可恢复。
                </p>
            </Modal>
        </>
    )
}
