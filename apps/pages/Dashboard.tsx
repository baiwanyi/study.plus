import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { tasksApi, pointsApi, rulesApi } from '../lib/api'
import type {
    Task,
    PointStats,
    MonthSummary,
    ExchangeItemRule,
    HomeworkGradeRule,
    ExamRuleRange,
    CustomRule,
} from '../lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
    taskStatusLabels,
    getCurrentMonth,
} from '../lib/utils'
import { X, CircleQuestionMark } from 'lucide-react'
import { useSnackbar } from '../components/Snackbar'
import MDEditor from '@uiw/react-md-editor'

const helpTabs = [
    { key: 'faq' as const, label: '常见问题', file: '/docs/faq.md' },
    { key: 'markdown' as const, label: 'Markdown 语法', file: '/docs/markdown.md' },
    { key: 'mermaid' as const, label: 'Mermaid 思维导图', file: '/docs/mermaid.md' },
]

export default function Dashboard() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [stats, setStats] = useState<PointStats | null>(null)
    const [summary, setSummary] = useState<MonthSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const { showSnackbar } = useSnackbar()

    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])
    const [homeworkRules, setHomeworkRules] = useState<HomeworkGradeRule[]>([])
    const [examRules, setExamRules] = useState<ExamRuleRange[]>([])
    const [customRules, setCustomRules] = useState<CustomRule[]>([])
    const [monthlyBasePoints, setMonthlyBasePoints] = useState<number>(0)

    // Help modal state (must be before any early return — Rules of Hooks)
    const [showHelp, setShowHelp] = useState(false)
    const [helpTab, setHelpTab] = useState<'faq' | 'markdown' | 'mermaid'>('faq')
    const [helpContents, setHelpContents] = useState<Record<string, string>>({})
    const helpContentsRef = useRef<Record<string, string>>({})

    const handleOpenHelp = useCallback(() => {
        document.body.style.overflow = 'hidden'
        setShowHelp(true)
    }, [])

    const handleCloseHelp = useCallback(() => {
        document.body.style.overflow = ''
        setShowHelp(false)
    }, [])

    // Reset overflow on unmount
    useEffect(() => {
        return () => { document.body.style.overflow = '' }
    }, [])

    // Fetch help content on tab switch
    useEffect(() => {
        if (!showHelp) return
        const entry = helpTabs.find((t) => t.key === helpTab)
        if (!entry || helpContentsRef.current[entry.key]) return
        fetch(entry.file)
            .then((res) => res.text())
            .then((text) => {
                helpContentsRef.current[entry.key] = text
                setHelpContents((prev) => ({ ...prev, [entry.key]: text }))
            })
            .catch(() => {
                showSnackbar('加载帮助文档失败')
            })
    }, [showHelp, helpTab, showSnackbar])

    const loadData = async () => {
        try {
            const [
                tasksData,
                statsData,
                summaryData,
                exchangeRulesData,
                homeworkData,
                examData,
                customData,
                systemData,
            ] = await Promise.all([
                tasksApi.list().catch(() => null),
                pointsApi.stats().catch(() => null),
                pointsApi.summary().catch(() => null),
                rulesApi.get('exchange').catch(() => null),
                rulesApi.get('homework').catch(() => null),
                rulesApi.get('exam').catch(() => null),
                rulesApi.get('custom').catch(() => null),
                rulesApi.get('system').catch(() => null),
            ])
            setTasks(tasksData ?? [])
            setStats(statsData ?? null)
            setSummary(summaryData ?? null)
            if (exchangeRulesData) {
                const exSrc = exchangeRulesData as unknown
                if (Array.isArray(exSrc)) {
                    setExchangeRules(
                        (exSrc as Record<string, unknown>[]).map(
                            (item) =>
                                ({
                                    key: String(item.key ?? ''),
                                    label: String(item.label ?? ''),
                                    points: Number(item.points ?? 1),
                                    ratio: Number(
                                        item.ratio ??
                                            item.minutes ??
                                            item.yuan ??
                                            1,
                                    ),
                                    unit: String(
                                        item.unit ??
                                            (item.minutes != null
                                                ? '分钟'
                                                : item.yuan != null
                                                  ? '元'
                                                  : '次'),
                                    ),
                                }) as ExchangeItemRule,
                        ),
                    )
                } else if (exSrc && typeof exSrc === 'object') {
                    const converted = Object.entries(
                        exSrc as Record<string, unknown>,
                    ).map(([key, val]) => {
                        const item = val as Record<string, unknown>
                        const ratio =
                            item.ratio !== undefined
                                ? Number(item.ratio)
                                : item.minutes !== undefined
                                  ? Number(item.minutes)
                                  : item.yuan !== undefined
                                    ? Number(item.yuan)
                                    : 1
                        const unit =
                            item.unit !== undefined
                                ? String(item.unit)
                                : item.minutes !== undefined
                                  ? '分钟'
                                  : item.yuan !== undefined
                                    ? '元'
                                    : '次'
                        return {
                            key,
                            label: String(item.label ?? key),
                            points: Number(item.points ?? 1),
                            ratio,
                            unit,
                        } as ExchangeItemRule
                    })
                    setExchangeRules(converted)
                }
            }
            // Parse homework rules
            if (homeworkData) {
                const hwSrc = homeworkData as unknown
                if (Array.isArray(hwSrc)) {
                    setHomeworkRules(
                        hwSrc.map(
                            (item: Record<string, unknown>) =>
                                ({
                                    grade: String(item.grade ?? ''),
                                    points: Number(item.points ?? 0),
                                }) as HomeworkGradeRule,
                        ),
                    )
                } else if (hwSrc && typeof hwSrc === 'object') {
                    setHomeworkRules(
                        Object.entries(hwSrc as Record<string, unknown>).map(
                            ([grade, points]) =>
                                ({
                                    grade,
                                    points: Number(points),
                                }) as HomeworkGradeRule,
                        ),
                    )
                }
            }
            // Parse exam rules
            if (examData) {
                const examSrc = examData as Record<string, unknown>
                if (Array.isArray(examSrc)) {
                    setExamRules(
                        examSrc.map(
                            (item: Record<string, unknown>) =>
                                ({
                                    min: Number(item.min ?? 0),
                                    max: Number(item.max ?? 100),
                                    points: Number(item.points ?? 0),
                                }) as ExamRuleRange,
                        ),
                    )
                } else if (examSrc && typeof examSrc === 'object') {
                    if (Array.isArray(examSrc.ranges)) {
                        setExamRules(
                            (examSrc.ranges as Record<string, unknown>[]).map(
                                (item) =>
                                    ({
                                        min: Number(item.min ?? 0),
                                        max: Number(item.max ?? 100),
                                        points: Number(item.points ?? 0),
                                    }) as ExamRuleRange,
                            ),
                        )
                    }
                }
            }
            // Parse system rules
            if (systemData) {
                const sysSrc = systemData as Record<string, unknown>
                if (sysSrc?.monthlyBasePoints !== undefined)
                    setMonthlyBasePoints(Number(sysSrc.monthlyBasePoints))
            }
            // Parse custom rules
            if (customData) {
                const cSrc = customData as unknown
                if (Array.isArray(cSrc)) {
                    setCustomRules(
                        cSrc.map(
                            (item: Record<string, unknown>) =>
                                ({
                                    id: String(item.id ?? ''),
                                    name: String(item.name ?? ''),
                                    type: (item.type === 'deduct'
                                        ? 'deduct'
                                        : 'earn') as 'earn' | 'deduct',
                                    points: Number(item.points ?? 0),
                                    description: String(item.description ?? ''),
                                }) as CustomRule,
                        ),
                    )
                }
            }
        } catch (err) {
            console.error('Failed to load dashboard:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'pending'), [tasks])
    const month = getCurrentMonth()

    const statCards = useMemo(() => [
        {
            label: '本月积分',
            value: stats?.totalEarn ?? 0,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
        },
        {
            label: '本月兑换',
            value: stats?.totalDeduct ?? 0,
            color: 'text-red-600',
            bg: 'bg-red-50',
        },
        {
            label: '待完成作业',
            value: pendingTasks.length,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
        },
        {
            label: '总作业数',
            value: tasks.length,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
        },
    ], [stats, pendingTasks.length, tasks.length])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">加载中...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">首页看板</h2>
                <button onClick={handleOpenHelp}>
                    <CircleQuestionMark className="w-5 h-5 flex-shrink-0 text-gray-600 hover:text-gray-700" />
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <div key={card.label} className="card">
                        <p className="text-sm text-gray-500">{card.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${card.color}`}>
                            {card.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Net Change & Balance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card">
                    <p className="text-sm text-gray-500">可用积分 ({month})</p>
                    <p
                        className={`text-4xl font-bold mt-2 ${(summary?.availableBalance ?? 0) >= (summary?.minimumPointsForPrivileges ?? 0) ? 'text-indigo-600' : 'text-red-600'}`}>
                        {summary?.availableBalance ?? 0}
                    </p>
                    {(summary?.availableBalance ?? 0) <
                        (summary?.minimumPointsForPrivileges ?? 0) && (
                        <p className="text-xs text-red-500 mt-1">
                            余额不足{summary?.minimumPointsForPrivileges ?? 0}
                            ，电视/设备特权暂不可用
                        </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                        * 本月获取积分下月方可使用
                    </p>
                </div>
                <div className="card">
                    <p className="text-sm text-gray-500">总余额 ({month})</p>
                    <p
                        className={`text-4xl font-bold mt-2 ${(summary?.balance ?? 0) >= (summary?.minimumPointsForPrivileges ?? 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                        {summary?.balance ?? 0}
                    </p>
                    <p className="text-xs text-gray-400 mt-2">
                        含本月待结积分 +{stats?.totalEarn ?? 0}
                    </p>
                </div>
            </div>

            {/* Pending Tasks */}
            {pendingTasks.length > 0 && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        待完成作业
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        名称
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        类型
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        状态
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingTasks.map((task) => (
                                    <tr
                                        key={task.id}
                                        className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-2 px-3 font-medium text-gray-900">
                                            {task.title}
                                        </td>
                                        <td className="py-2 px-3">
                                            <span
                                                className={`badge ${taskTypeColors[task.type]}`}>
                                                {taskTypeLabels[task.type]}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3">
                                            <span className="badge-pending">
                                                {taskStatusLabels[task.status]}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* All Rules List */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Homework Grade Rules */}
                {homeworkRules.length > 0 && (
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            作业评分积分
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            等级
                                        </th>
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            积分
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {homeworkRules.map((rule) => (
                                        <tr
                                            key={rule.grade}
                                            className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="py-2 px-3">
                                                <span className="badge bg-purple-100 text-purple-800">
                                                    {rule.grade}
                                                </span>
                                            </td>
                                            <td
                                                className={`py-2 px-3 font-medium ${rule.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {rule.points >= 0 ? '+' : ''}
                                                {rule.points}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Exam Score Rules */}
                {examRules.length > 0 && (
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            单元测评积分
                        </h3>
                        {monthlyBasePoints > 0 && (
                            <p className="text-xs text-gray-500 mb-3">
                                基础积分：{monthlyBasePoints}
                            </p>
                        )}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            分数区间
                                        </th>
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            积分
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {examRules.map((rule, idx) => (
                                        <tr
                                            key={idx}
                                            className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="py-2 px-3 text-gray-700">
                                                {rule.min} ~ {rule.max} 分
                                            </td>
                                            <td
                                                className={`py-2 px-3 font-medium ${rule.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {rule.points >= 0 ? '+' : ''}
                                                {rule.points}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Custom Rules */}
                {customRules.length > 0 && (
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            自定义规则
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-200">
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            名称
                                        </th>
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            类型
                                        </th>
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            积分
                                        </th>
                                        <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                            说明
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customRules.map((rule, idx) => (
                                        <tr
                                            key={rule.name || rule.id || `custom-${idx}`}
                                            className="border-b border-gray-50 hover:bg-gray-50">
                                            <td className="py-2 px-3 font-medium text-gray-900">
                                                {rule.name}
                                            </td>
                                            <td className="py-2 px-3">
                                                <span
                                                    className={`badge ${rule.type === 'earn' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                                                    {rule.type === 'earn'
                                                        ? '加分'
                                                        : '扣分'}
                                                </span>
                                            </td>
                                            <td
                                                className={`py-2 px-3 font-medium ${rule.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                {rule.type === 'earn'
                                                    ? '+'
                                                    : '-'}
                                                {rule.points}
                                            </td>
                                            <td className="py-2 px-3 text-gray-500">
                                                {rule.description}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Exchange Rules */}
            {exchangeRules.length > 0 && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        兑换规则
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        项目
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        积分
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        可兑换
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        比例
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {exchangeRules.map((rule) => (
                                    <tr
                                        key={rule.key}
                                        className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-2 px-3 font-medium text-gray-900">
                                            <span className="badge bg-indigo-100 text-indigo-800">
                                                {rule.label}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-gray-700">
                                            {rule.points} 积分
                                        </td>
                                        <td className="py-2 px-3 text-gray-700">
                                            {rule.ratio} {rule.unit}
                                        </td>
                                        <td className="py-2 px-3 text-gray-500">
                                            {rule.points} 积分 = {rule.ratio}{' '}
                                            {rule.unit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}


            {/* Help Modal — rendered via portal to ensure top-level stacking */}
            {showHelp && createPortal(
                <div className="fixed inset-0 z-[9999]">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={handleCloseHelp}
                    />
                    <div className="relative bg-white w-full h-full overflow-y-auto">
                        <div className="sticky top-0 bg-white z-10">
                            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    帮助文档
                                </h3>
                                <button
                                    onClick={handleCloseHelp}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex border-b border-gray-200">
                                {helpTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setHelpTab(tab.key)}
                                        className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                                            helpTab === tab.key
                                                ? 'text-indigo-600 border-b-2 border-indigo-600'
                                                : 'text-gray-500 hover:text-gray-700'
                                        }`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="p-6 prose prose-sm max-w-none">
                            <MDEditor.Markdown source={helpContents[helpTab] ?? ''} />
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    )
}
