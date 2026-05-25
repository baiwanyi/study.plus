import { useState, useEffect, useCallback } from 'react'
import { Plus, SquarePen, Trash2, Eye, Check, X } from 'lucide-react'
import { DataTable } from '@apps/components/DataTable'
import Tabs from '@apps/components/Tabs'
import { weeklyApi, optionsAPI } from '@apps/lib/api'
import { formatDate, formatErrorMessage } from '@apps/lib/utils'
import { DEFAULT_WEEKLY_AI_HELPER } from '@apps/lib/default'
import { useSnackbar } from '@apps/components/Snackbar'
import WeeklyModalDelete from '@pages/layout/WeeklyModalDelete'
import WeeklyModalEditor from '@pages/layout/WeeklyModalEditor'
import WeeklyModalViewer from '@pages/layout/WeeklyModalViewer'
import WeeklyModalSaveSelection from '@pages/layout/WeeklyModalSaveSelection'
import type {
    WeeklyReport,
    WeeklyAnalysis,
    WeeklyMessage,
} from '@apps/lib/types'
import type { WeeklyReportContent } from '@apps/lib/weekly'
import { parseContent } from '@apps/lib/weekly'

/** 获取当前是年度的第几周（ISO 周） */
function getWeekNumber(date: Date): number {
    const temp = new Date(date.valueOf())
    const dayNum = (date.getDay() + 6) % 7
    temp.setDate(temp.getDate() - dayNum + 3)
    const firstThursday = temp.valueOf()
    temp.setMonth(0, 1)
    if (temp.getDay() !== 4) {
        temp.setMonth(0, 1 + ((4 - temp.getDay() + 7) % 7))
    }
    return 1 + Math.ceil((firstThursday - temp.valueOf()) / 604800000)
}

const emptyContent: WeeklyReportContent = {
    learned: '',
    difficulties: '',
    weakPoints: '',
    achievement: '',
    lastWeekGoalReview: '',
    smartGoalS: '',
    smartGoalM: '',
    smartGoalA: '',
    smartGoalR: '',
    smartGoalT: '',
    improvement: '',
}

export default function Weekly() {
    const { showSnackbar } = useSnackbar()
    const currentYear = new Date().getFullYear()
    const [reports, setReports] = useState<WeeklyReport[]>([])
    const [year, setYear] = useState(currentYear)
    const [years, setYears] = useState<number[]>([currentYear])
    const [modalOpen, setModalOpen] = useState(false)
    const [editingReport, setEditingReport] = useState<WeeklyReport | null>(
        null,
    )
    const [form, setForm] = useState<WeeklyReportContent>(emptyContent)
    const [analysis, setAnalysis] = useState<WeeklyAnalysis | null>(null)
    const [chatMessages, setChatMessages] = useState<WeeklyMessage[]>([])
    const [chatInput, setChatInput] = useState('')
    const [analyzing, setAnalyzing] = useState(false)
    const [chatting, setChatting] = useState(false)
    const [viewingReport, setViewingReport] = useState<WeeklyReport | null>(
        null,
    )
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
    const [showSaveDialog, setShowSaveDialog] = useState(false)
    const [aiHelperName, setAiHelperName] = useState(DEFAULT_WEEKLY_AI_HELPER)

    // ===== Load reports =====
    const loadReports = useCallback(async () => {
        try {
            const data = await weeklyApi.list(year)
            setReports(data)
            // Collect all years from data
            const allYears = new Set(data.map((r) => r.year))
            allYears.add(currentYear)
            setYears(Array.from(allYears).sort((a, b) => b - a))
        } catch (err) {
            showSnackbar('加载周报失败: ' + formatErrorMessage(err), 'error')
        }
    }, [year, currentYear, showSnackbar])

    useEffect(() => {
        loadReports()
    }, [loadReports])

    // ===== Load AI helper name =====
    useEffect(() => {
        optionsAPI
            .get('weeklyAiHelper')
            .then((data) => {
                if (
                    data &&
                    typeof data === 'object' &&
                    'display_name' in data
                ) {
                    const dn = (data as Record<string, unknown>).display_name
                    if (typeof dn === 'string') setAiHelperName(dn)
                } else if (typeof data === 'string') {
                    setAiHelperName(data)
                }
            })
            .catch(() => {})
    }, [])

    // ===== Modal open / close =====
    const openCreateModal = () => {
        setEditingReport(null)
        setForm(emptyContent)
        setAnalysis(null)
        setChatMessages([])
        setModalOpen(true)
    }

    const openEditModal = async (report: WeeklyReport) => {
        setEditingReport(report)
        const content = parseContent(report.content)
        setForm(content)
        const parsedAnalysis = report.analysis
            ? typeof report.analysis === 'string'
                ? JSON.parse(report.analysis)
                : report.analysis
            : null
        setAnalysis(parsedAnalysis)

        // Load conversation messages from DB
        try {
            const conv = await weeklyApi.getConversation(report.id)
            setChatMessages(conv.messages)
        } catch {
            setChatMessages([])
        }

        setModalOpen(true)
    }

    const openViewModal = (report: WeeklyReport) => {
        setViewingReport(report)
    }

    const closeModal = () => {
        setModalOpen(false)
        setEditingReport(null)
        setShowSaveDialog(false)
    }

    // ===== Save Only (close after save) =====
    const handleSaveOnly = async () => {
        if (!form.learned.trim() || !form.difficulties.trim()) {
            showSnackbar('请至少填写"学到的东西"和"遇到的困难"', 'error')
            return
        }
        setAnalyzing(true)
        try {
            const currentWeek = getWeekNumber(new Date())
            if (editingReport) {
                await weeklyApi.update(editingReport.id, { content: form })
            } else {
                const created = await weeklyApi.create({
                    weekNumber: currentWeek,
                    year: currentYear,
                    content: form,
                })
                setEditingReport(created)
            }
            showSnackbar('保存成功')
            await loadReports()
            closeModal()
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setAnalyzing(false)
        }
    }

    // ===== Save & Analyze (single button, stays open) =====
    const handleSaveAndAnalyze = async () => {
        if (!form.learned.trim() || !form.difficulties.trim()) {
            showSnackbar('请至少填写"学到的东西"和"遇到的困难"', 'error')
            return
        }

        setAnalyzing(true)
        try {
            const currentWeek = getWeekNumber(new Date())
            let reportId: number

            if (editingReport) {
                await weeklyApi.update(editingReport.id, { content: form })
                reportId = editingReport.id
            } else {
                const created = await weeklyApi.create({
                    weekNumber: currentWeek,
                    year: currentYear,
                    content: form,
                })
                reportId = created.id
                setEditingReport(created)
            }

            const res = await weeklyApi.analyze(reportId)
            setAnalysis(res.analysis)
            // Reload conversation messages from DB
            const conv = await weeklyApi.getConversation(reportId)
            setChatMessages(conv.messages)
            showSnackbar('分析完成')
            await loadReports()
        } catch (err) {
            showSnackbar('操作失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setAnalyzing(false)
        }
    }

    // ===== AI Chat (saves to weekly_messages automatically) =====
    const handleChat = async () => {
        if (!chatInput.trim() || !editingReport) return
        const msg = chatInput.trim()
        setChatInput('')
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
            await loadReports()
        } catch (err) {
            showSnackbar('删除失败: ' + formatErrorMessage(err), 'error')
        }
    }

    // ===== Form helpers =====
    const updateForm = (field: keyof WeeklyReportContent, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    // ===== DataTable columns =====
    interface ColumnItem {
        key: string
        header: string
        render?: (record: WeeklyReport, index: number) => React.ReactNode
    }

    /** 解析 content JSON，安全处理 */
    const parseContentLocal = (record: WeeklyReport): WeeklyReportContent =>
        parseContent(record.content)

    /** 勾/叉图标 */
    const checkIcon = (filled: boolean) =>
        filled ? (
            <Check className="size-4 text-success inline" />
        ) : (
            <X className="size-4 text-danger inline" />
        )

    /** 判断字段是否已填写 */
    const isFilled = (val: string | undefined) =>
        val !== undefined && val.trim().length > 0

    const columns: ColumnItem[] = [
        {
            key: 'week',
            header: '周次',
            render: (record: WeeklyReport) =>
                `${record.year} · 第${record.weekNumber}周`,
        },
        {
            key: 'learned',
            header: '学到的东西',
            render: (record: WeeklyReport) =>
                checkIcon(isFilled(parseContentLocal(record).learned)),
        },
        {
            key: 'difficulties',
            header: '遇到的困难',
            render: (record: WeeklyReport) =>
                checkIcon(isFilled(parseContentLocal(record).difficulties)),
        },
        {
            key: 'weakPoints',
            header: '未掌握知识点',
            render: (record: WeeklyReport) =>
                checkIcon(isFilled(parseContentLocal(record).weakPoints)),
        },
        {
            key: 'achievement',
            header: '成就感故事',
            render: (record: WeeklyReport) =>
                checkIcon(isFilled(parseContentLocal(record).achievement)),
        },
        {
            key: 'smartGoal',
            header: '下周规划',
            render: (record: WeeklyReport) => {
                const c = parseContentLocal(record)
                const hasGoal =
                    isFilled(c.smartGoalS) ||
                    isFilled(c.smartGoalM) ||
                    isFilled(c.smartGoalA) ||
                    isFilled(c.smartGoalR) ||
                    isFilled(c.smartGoalT)
                return checkIcon(hasGoal)
            },
        },
        {
            key: 'analysis',
            header: 'AI 分析',
            render: (record: WeeklyReport) => (
                <span
                    className={
                        record.analysis ? 'text-success' : 'text-gray-300'
                    }>
                    {record.analysis ? checkIcon(true) : checkIcon(false)}
                </span>
            ),
        },
        {
            key: 'createdAt',
            header: '创建时间',
            render: (record: WeeklyReport) => formatDate(record.createdAt),
        },
        {
            key: 'actions',
            header: '操作',
            render: (record: WeeklyReport) => (
                <div className="flex gap-1 justify-end">
                    <button
                        onClick={() => openViewModal(record)}
                        className="btn btn-outline btn-sm"
                        title="查看">
                        <Eye className="size-4" />
                    </button>
                    <button
                        onClick={() => openEditModal(record)}
                        className="btn btn-outline btn-sm"
                        title="编辑">
                        <SquarePen className="size-4" />
                    </button>
                    <button
                        onClick={() => setConfirmDelete(record.id)}
                        className="btn btn-outline btn-sm text-danger"
                        title="删除">
                        <Trash2 className="size-4" />
                    </button>
                </div>
            ),
        },
    ]

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
                <div className="card">
                    <DataTable
                        data={reports}
                        columns={columns}
                        rowKey="id"
                        emptyText="暂无周报，点击上方按钮撰写"
                    />
                </div>
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
                chatInput={chatInput}
                onChatInputChange={setChatInput}
                chatting={chatting}
                onChat={handleChat}
                onConfirm={() => {
                    if (analysis) {
                        handleSaveAndAnalyze()
                    } else {
                        setShowSaveDialog(true)
                    }
                }}
                isDisabled={
                    !form.learned.trim() ||
                    !form.difficulties.trim() ||
                    !(
                        form.smartGoalS.trim() ||
                        form.smartGoalM.trim() ||
                        form.smartGoalA.trim() ||
                        form.smartGoalR.trim() ||
                        form.smartGoalT.trim()
                    )
                }
                onCancel={closeModal}
                aiHelperName={aiHelperName}
            />

            <WeeklyModalSaveSelection
                open={showSaveDialog}
                analyzing={analyzing}
                onCancel={() => setShowSaveDialog(false)}
                onSaveOnly={handleSaveOnly}
                onSaveAndAnalyze={handleSaveAndAnalyze}
            />

            <WeeklyModalViewer
                report={viewingReport}
                onCancel={() => setViewingReport(null)}
            />
        </>
    )
}
