'use client'

import { Plus } from 'lucide-react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { weeklyApi, optionsAPI } from '@apps/utils/api'
import { formatErrorMessage } from '@apps/utils/client'
import { useSnackbar } from '@components/Snackbar'
import { Tabs } from '@components/Tabs'
import { DEFAULT_WEEKLY_AI_HELPER } from '@shared/constants'
import { createEmptyContent, getWeekNumber, parseContent } from '@shared/weekly'
import { WeeklyListTable } from './WeeklyListTable'
import { useWeeklyAutoSave } from './hooks/useWeeklyAutoSave'
import { WeeklyModalDelete } from './WeeklyModalDelete'
import { WeeklyModalEditor } from './WeeklyModalEditor'
import { WeeklyModalViewer } from './WeeklyModalViewer'
import type { WeeklyReport, WeeklyAnalysis, WeeklyMessage } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'

/** 从上一周报告中提取 SMART 目标，生成 checklist 文本 */
function buildGoalChecklist(
    reports: WeeklyReport[],
    prevWeekNumber: number,
): string {
    if (prevWeekNumber <= 0) return ''
    const prevReport = reports.find((r) => r.weekNumber === prevWeekNumber)
    if (!prevReport) return ''

    const prevContent = parseContent(prevReport.content)
    const dimensions: { key: keyof WeeklyReportContent; prefix: string }[] = [
        { key: 'smartGoalS', prefix: 'S' },
        { key: 'smartGoalM', prefix: 'M' },
        { key: 'smartGoalA', prefix: 'A' },
        { key: 'smartGoalR', prefix: 'R' },
        { key: 'smartGoalT', prefix: 'T' },
    ]
    const lines = dimensions.flatMap(({ key, prefix }) => {
        const value = prevContent[key]
        if (!value?.trim()) return []
        return value
            .split('\n')
            .filter((l) => l.trim())
            .map((l) => `* [ ] ${prefix} - ${l.trim()}`)
    })
    return lines.length > 0 ? lines.join('\n') : ''
}

export function Weekly() {
    const { showSnackbar } = useSnackbar()
    const currentYear = new Date().getFullYear()
    const [reports, setReports] = useState<WeeklyReport[]>([])
    const [year, setYear] = useState(currentYear)
    const [years, setYears] = useState<number[]>([currentYear])
    const [modalOpen, setModalOpen] = useState(false)
    const [editingReport, setEditingReport] = useState<WeeklyReport | null>(
        null,
    )
    const [form, setForm] = useState<WeeklyReportContent>(() =>
        createEmptyContent(),
    )
    const [analysis, setAnalysis] = useState<WeeklyAnalysis | null>(null)
    const [chatMessages, setChatMessages] = useState<WeeklyMessage[]>([])
    const [analyzing, setAnalyzing] = useState(false)
    const [evaluationError, setEvaluationError] = useState(false)
    const [chatting, setChatting] = useState(false)
    const [viewingReport, setViewingReport] = useState<WeeklyReport | null>(
        null,
    )
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
    const [aiHelperName, setAiHelperName] = useState(DEFAULT_WEEKLY_AI_HELPER)

    // ===== Auto-save =====
    const contentSnapshotRef = useRef('')
    const latestReqId = useRef(0)
    const { isAutoSavingRef, lastSavedFormRef } = useWeeklyAutoSave(
        editingReport,
        form,
        modalOpen,
    )

    // ===== Load reports =====
    const loadReports = useCallback(
        async (silent = false) => {
            const reqId = ++latestReqId.current
            try {
                const data = await weeklyApi.list(year)
                if (reqId !== latestReqId.current) return
                setReports(data)
                // Collect all years from data
                const allYears = new Set(data.map((r) => r.year))
                allYears.add(currentYear)
                setYears(Array.from(allYears).sort((a, b) => b - a))
            } catch (err) {
                if (reqId !== latestReqId.current) return
                if (!silent) {
                    showSnackbar(
                        '加载周报失败: ' + formatErrorMessage(err),
                        'error',
                    )
                }
            }
        },
        [year, currentYear, showSnackbar],
    )

    useEffect(() => {
        loadReports()
    }, [loadReports])

    // ===== Load AI helper name =====
    useEffect(() => {
        optionsAPI
            .get('weeklyAiHelper')
            .then((data) => {
                const name =
                    typeof data === 'string'
                        ? data
                        : (data as Record<string, unknown> | null)?.display_name
                if (typeof name === 'string') setAiHelperName(name)
            })
            .catch(() => {})
    }, [])

    // ===== Modal open / close =====
    const openCreateModal = () => {
        setEditingReport(null)
        setAnalysis(null)
        setChatMessages([])

        const empty = createEmptyContent()
        const checklist = buildGoalChecklist(
            reports,
            getWeekNumber(new Date()) - 1,
        )
        const nextForm = checklist
            ? { ...empty, lastWeekGoalReview: checklist }
            : empty
        setForm(nextForm)
        contentSnapshotRef.current = JSON.stringify(nextForm)

        setModalOpen(true)
    }

    const openEditModal = useCallback(async (report: WeeklyReport) => {
        setEditingReport(report)
        const content = parseContent(report.content)
        setForm(content)
        contentSnapshotRef.current = JSON.stringify(content)
        let parsedAnalysis: WeeklyAnalysis | null = null
        if (report.analysis) {
            try {
                parsedAnalysis =
                    typeof report.analysis === 'string'
                        ? JSON.parse(report.analysis)
                        : report.analysis
            } catch {
                parsedAnalysis = null
            }
        }
        setAnalysis(parsedAnalysis)

        // Load conversation messages from DB
        try {
            const conv = await weeklyApi.getConversation(report.id)
            setChatMessages(conv.messages)
        } catch {
            setChatMessages([])
        }

        setModalOpen(true)
    }, [])

    const openViewModal = useCallback((report: WeeklyReport) => {
        setViewingReport(report)
    }, [])

    const closeModal = () => {
        setModalOpen(false)
        setEditingReport(null)
        setEvaluationError(false)
        contentSnapshotRef.current = ''
    }

    // ===== Save + Analyze (keeps modal open) =====
    const handleSave = async () => {
        if (!form.learned.trim() || !form.difficulties.trim()) {
            showSnackbar('请至少填写"学到的东西"和"遇到的困难"', 'error')
            return
        }

        const serializedForm = JSON.stringify(form)
        const contentChanged = serializedForm !== contentSnapshotRef.current
        const isRetry = evaluationError && !contentChanged

        // 从未分析过时，即使内容无变化也执行分析
        if (!isRetry && !contentChanged && editingReport?.analysis) {
            showSnackbar('内容没有变化')
            return
        }

        isAutoSavingRef.current = true
        setAnalyzing(true)
        setEvaluationError(false)

        try {
            let reportId: number

            if (!isRetry && contentChanged) {
                if (editingReport) {
                    await weeklyApi.update(editingReport.id, { content: form })
                    reportId = editingReport.id
                } else {
                    const currentWeek = getWeekNumber(new Date())
                    const created = await weeklyApi.create({
                        weekNumber: currentWeek,
                        year: currentYear,
                        content: form,
                    })
                    reportId = created.id
                    setEditingReport(created)
                }
                lastSavedFormRef.current = serializedForm
                contentSnapshotRef.current = serializedForm
            } else {
                if (!editingReport) {
                    showSnackbar('保存失败: 未知的周报', 'error')
                    return
                }
                reportId = editingReport.id
            }

            const res = await weeklyApi.analyze(reportId)
            setAnalysis(res.analysis)
            // 内容变更分支已在保存后设置，重试分支在此更新
            contentSnapshotRef.current = serializedForm
            // Reload conversation messages from DB
            const conv = await weeklyApi.getConversation(reportId)
            setChatMessages(conv.messages)
            showSnackbar('保存并分析成功')
            // 后台刷新列表（失败静默，保存成功不受影响）
            loadReports(true)
        } catch {
            setEvaluationError(true)
            showSnackbar(
                '内容已保存，但 AI 分析失败，可点击"保存并分析"重试',
                'error',
            )
        } finally {
            setAnalyzing(false)
            isAutoSavingRef.current = false
        }
    }

    // ===== AI Chat (saves to weekly_messages automatically) =====
    const handleChat = async (message: string) => {
        const msg = message.trim()
        if (!msg || !editingReport) return
        // Optimistically show user message immediately
        const tempMsg: WeeklyMessage = {
            id: -Date.now(),
            conversationId: 0,
            role: 'user',
            content: msg,
            createdAt: new Date().toISOString(),
        }
        setChatMessages((prev) => [...prev, tempMsg])
        setChatting(true)
        try {
            await weeklyApi.chat(editingReport.id, msg)
            // Reload all messages from DB to get user msg + AI reply
            const conv = await weeklyApi.getConversation(editingReport.id)
            setChatMessages(conv.messages)
        } catch (err) {
            showSnackbar('AI对话失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setChatting(false)
        }
    }

    // ===== Delete =====
    const handleDelete = async (id: number) => {
        try {
            await weeklyApi.delete(id)
            showSnackbar('删除成功')
            setConfirmDelete(null)
        } catch (err) {
            showSnackbar('删除失败: ' + formatErrorMessage(err), 'error')
            return
        }
        // 后台刷新列表（失败静默，删除已成功）
        loadReports(true)
    }

    // ===== Form helpers =====
    const updateForm = (field: keyof WeeklyReportContent, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    const handleRequestDelete = useCallback(
        (id: number) => setConfirmDelete(id),
        [],
    )

    // ===== Render =====
    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between gap-4">
                    <h2>学习周报</h2>
                    <button
                        onClick={openCreateModal}
                        className="btn btn-primary">
                        <Plus className="size-4" />
                        撰写周报
                    </button>
                </div>

                {years.length > 1 && (
                    <Tabs
                        tabs={years.map((y) => ({
                            key: String(y),
                            label: String(y),
                        }))}
                        active={String(year)}
                        onChange={(key) => setYear(Number(key))}
                    />
                )}
                <WeeklyListTable
                    reports={reports}
                    onView={openViewModal}
                    onEdit={openEditModal}
                    onDelete={handleRequestDelete}
                />
            </div>

            <WeeklyModalDelete
                confirmId={confirmDelete}
                onCancel={() => setConfirmDelete(null)}
                onConfirm={handleDelete}
            />

            <WeeklyModalEditor
                open={modalOpen}
                weekNumber={
                    editingReport?.weekNumber ?? getWeekNumber(new Date())
                }
                form={form}
                onFormChange={updateForm}
                analysis={analysis}
                analyzing={analyzing}
                chatMessages={chatMessages}
                sending={chatting}
                onSend={handleChat}
                onConfirm={handleSave}
                onCancel={closeModal}
                aiHelperName={aiHelperName}
            />

            <WeeklyModalViewer
                report={viewingReport}
                onCancel={() => setViewingReport(null)}
            />
        </>
    )
}
