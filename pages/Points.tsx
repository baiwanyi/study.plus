import { useState, useEffect } from 'react'
import { pointsApi, rulesApi } from '@apps/lib/api'
import type {
    PointRecord,
    PointStats,
    Grade,
    HomeworkGradeRule,
    CustomRule,
    ExamRuleRange,
} from '@apps/lib/types'
import { formatDate, pointTypeLabels, getCurrentMonth, isAdmin, formatErrorMessage } from '@apps/lib/utils'
import { useSnackbar } from '@components/Snackbar'
import { X } from 'lucide-react'

const defaultGradeOptions: Grade[] = ['A+', 'A', 'B', 'C', 'D', 'E']
const categoryOptions = [
    { value: 'exam', label: '单元测评' },
    { value: 'submission', label: '作业批改' },
    { value: 'custom', label: '自定义规则' },
]

const defaultRemarkOptions =
    '5+3练习册\n数学同步\n语文同步\n英语同步\n口算练习\n阅读打卡\n写字练习\n试卷订正'

const PAGE_SIZE = 20

export default function Points() {
    const { showSnackbar } = useSnackbar()
    const [records, setRecords] = useState<PointRecord[]>([])
    const [stats, setStats] = useState<PointStats | null>(null)
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState<string>('')
    const [filterMonth, setFilterMonth] = useState(getCurrentMonth())
    const [page, setPage] = useState(1)

    // Add record modal
    const [showAdd, setShowAdd] = useState(false)
    const [addCategory, setAddCategory] = useState('exam')
    const [addGrade, setAddGrade] = useState<string>('A')
    const [addRemark, setAddRemark] = useState('')
    const [adding, setAdding] = useState(false)
    const [gradeOptions, setGradeOptions] =
        useState<string[]>(defaultGradeOptions)
    const [customRules, setCustomRules] = useState<CustomRule[]>([])
    const [addCustomRuleId, setAddCustomRuleId] = useState<string>('')
    const [customRuleTab, setCustomRuleTab] = useState<'earn' | 'deduct'>(
        'earn',
    )
    const [addExamScore, setAddExamScore] = useState<string>('')
    const [examRules, setExamRules] = useState<ExamRuleRange[]>([])
    // Remark options
    const [remarkOptions, setRemarkOptions] = useState(() => {
        return localStorage.getItem('remarkOptions') || defaultRemarkOptions
    })
    const [showRemarkSettings, setShowRemarkSettings] = useState(false)
    const [remarkSettingsText, setRemarkSettingsText] = useState('')

    const remarkTags = remarkOptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

    const load = async () => {
        try {
            const params: Record<string, string> = {}
            if (filterType) params.type = filterType
            if (filterMonth) params.month = filterMonth

            const [recordsData, statsData, homeworkData, customData, examData] =
                await Promise.all([
                    pointsApi.list(
                        Object.keys(params).length > 0 ? params : undefined,
                    ),
                    pointsApi.stats(filterMonth),
                    rulesApi.get('homework').catch(() => null),
                    rulesApi.get('custom').catch(() => null),
                    rulesApi.get('exam').catch(() => null),
                ])
            setRecords(recordsData)
            setStats(statsData)
            // Extract grade options from homework rules
            if (homeworkData) {
                const hw = homeworkData as unknown
                if (Array.isArray(hw)) {
                    const grades = (hw as HomeworkGradeRule[])
                        .map((g) => g.grade)
                        .filter(Boolean)
                    if (grades.length > 0) setGradeOptions(grades)
                } else if (hw && typeof hw === 'object') {
                    const grades = Object.keys(hw as Record<string, unknown>)
                    if (grades.length > 0) setGradeOptions(grades)
                }
            }
            // Extract custom rules
            if (customData && Array.isArray(customData)) {
                setCustomRules(customData as CustomRule[])
            }
            // Extract exam rules
            if (examData) {
                const ex = examData as unknown
                if (Array.isArray(ex)) {
                    setExamRules(ex as ExamRuleRange[])
                } else if (ex && typeof ex === 'object' && Array.isArray((ex as Record<string, unknown>).ranges)) {
                    setExamRules((ex as { ranges: ExamRuleRange[] }).ranges)
                }
            }
        } catch (err) {
            console.error('Failed to load points:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [filterType, filterMonth])

    const handleAdd = async () => {
        setAdding(true)
        try {
            if (addCategory === 'custom') {
                if (!addCustomRuleId) {
                    showSnackbar('请选择一条自定义规则', 'info')
                    setAdding(false)
                    return
                }
                await pointsApi.createByCustomRule(addCustomRuleId)
            } else if (addCategory === 'exam') {
                const score = Number(addExamScore)
                if (!addExamScore || isNaN(score)) {
                    showSnackbar('请输入有效分数', 'info')
                    setAdding(false)
                    return
                }
                await pointsApi.createByExamScore(
                    score,
                    addRemark || undefined,
                )
            } else {
                await pointsApi.createByGrade(
                    addCategory,
                    addGrade,
                    addRemark || undefined,
                )
            }
            setShowAdd(false)
            setAddRemark('')
            setAddGrade(gradeOptions[0] || 'A')
            setAddCustomRuleId('')
            setAddExamScore('')
            showSnackbar('添加成功')
            load()
        } catch (err) {
            showSnackbar('添加失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setAdding(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">加载中...</div>
            </div>
        )
    }

    const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE))
    const pagedRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">
                        积分记录
                    </h2>
                    {isAdmin() && (
                        <button
                            onClick={() => setShowAdd(true)}
                            className="btn-primary">
                            添加记录
                        </button>
                    )}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="card">
                        <p className="text-sm text-gray-500">本月积分</p>
                        <p className="text-3xl font-bold text-emerald-600">
                            {stats?.totalEarn ?? 0}
                        </p>
                    </div>
                    <div className="card">
                        <p className="text-sm text-gray-500">本月兑换</p>
                        <p className="text-3xl font-bold text-red-600">
                            {stats?.totalDeduct ?? 0}
                        </p>
                    </div>
                </div>

                {/* Filters */}
                <div className="card">
                    <div className="flex items-center gap-4">
                        <div>
                            <label className="label">类型</label>
                            <select
                                className="input"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}>
                                <option value="">全部</option>
                                <option value="earn">加分</option>
                                <option value="deduct">扣分</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">月份</label>
                            <input
                                className="input"
                                type="month"
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Records Table */}
                <div className="card overflow-hidden !p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    时间
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    类型
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    分值
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    原因
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    规则
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={5}
                                        className="py-8 text-center text-gray-400">
                                        暂无积分记录
                                    </td>
                                </tr>
                            ) : (
                                pagedRecords.map((record) => (
                                    <tr
                                        key={record.id}
                                        className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-gray-600">
                                            {formatDate(record.createdAt)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className={`badge-${record.type}`}>
                                                {pointTypeLabels[record.type]}
                                            </span>
                                        </td>
                                        <td
                                            className={`py-3 px-4 font-medium ${record.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {record.type === 'earn' ? '+' : '-'}
                                            {record.amount}
                                        </td>
                                        <td className="py-3 px-4 text-gray-700">
                                            {record.reason}
                                        </td>
                                        <td className="py-3 px-4 text-gray-500">
                                            {record.ruleName ?? '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    {records.length > PAGE_SIZE && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                            <p className="text-sm text-gray-500">
                                共 {records.length} 条，第 {page}/{totalPages}{' '}
                                页
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

            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setShowAdd(false)}
                    />
                    <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-gray-900">
                                    添加积分记录
                                </h3>
                                <button
                                    onClick={() => setShowAdd(false)}
                                    className="text-gray-400 hover:text-gray-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className="label">类别</label>
                                    <select
                                        className="input"
                                        value={addCategory}
                                        onChange={(e) => {
                                            setAddCategory(e.target.value)
                                            setAddCustomRuleId('')
                                            setAddExamScore('')
                                        }}>
                                        {categoryOptions.map((opt) => (
                                            <option
                                                key={opt.value}
                                                value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {addCategory === 'custom' ? (
                                    <div>
                                        <label className="label">
                                            选择自定义规则
                                        </label>
                                        {customRules.length === 0 ? (
                                            <p className="text-sm text-gray-400 py-4 text-center">
                                                暂无自定义规则，请先在规则管理中添加
                                            </p>
                                        ) : (
                                            <>
                                                <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCustomRuleTab(
                                                                'earn',
                                                            )
                                                            setAddCustomRuleId(
                                                                '',
                                                            )
                                                        }}
                                                        className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${
                                                            customRuleTab ===
                                                            'earn'
                                                                ? 'bg-white text-emerald-700 shadow-sm'
                                                                : 'text-gray-500 hover:text-gray-700'
                                                        }`}>
                                                        加分项
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCustomRuleTab(
                                                                'deduct',
                                                            )
                                                            setAddCustomRuleId(
                                                                '',
                                                            )
                                                        }}
                                                        className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${
                                                            customRuleTab ===
                                                            'deduct'
                                                                ? 'bg-white text-red-700 shadow-sm'
                                                                : 'text-gray-500 hover:text-gray-700'
                                                        }`}>
                                                        扣分项
                                                    </button>
                                                </div>
                                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                                    {customRules.filter(
                                                        (r) =>
                                                            r.type ===
                                                            customRuleTab,
                                                    ).length === 0 ? (
                                                        <p className="text-sm text-gray-400 py-4 text-center">
                                                            暂无
                                                            {customRuleTab ===
                                                            'earn'
                                                                ? '加分'
                                                                : '扣分'}
                                                            规则
                                                        </p>
                                                    ) : (
                                                        customRules
                                                            .filter(
                                                                (r) =>
                                                                    r.type ===
                                                                    customRuleTab,
                                                            )
                                                            .map(
                                                                (rule, idx) => {
                                                                    const ruleId =
                                                                        rule.id ??
                                                                        rule.name
                                                                    const isSelected =
                                                                        addCustomRuleId ===
                                                                        ruleId
                                                                    return (
                                                                        <button
                                                                            key={
                                                                                ruleId ||
                                                                                `rule-${idx}`
                                                                            }
                                                                            type="button"
                                                                            onClick={() =>
                                                                                setAddCustomRuleId(
                                                                                    ruleId,
                                                                                )
                                                                            }
                                                                            className={`w-full text-left p-3 rounded-lg border transition-all ${
                                                                                isSelected
                                                                                    ? customRuleTab ===
                                                                                      'earn'
                                                                                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                                                                                        : 'border-red-500 bg-red-50 ring-1 ring-red-500'
                                                                                    : 'border-gray-200 hover:bg-gray-50'
                                                                            }`}>
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-medium text-gray-900">
                                                                                    {
                                                                                        rule.name
                                                                                    }
                                                                                </span>
                                                                                <span
                                                                                    className={`text-sm font-bold ${rule.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                                    {rule.type ===
                                                                                    'earn'
                                                                                        ? '+'
                                                                                        : '-'}
                                                                                    {
                                                                                        rule.points
                                                                                    }
                                                                                </span>
                                                                            </div>
                                                                        </button>
                                                                    )
                                                                },
                                                            )
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : addCategory === 'exam' ? (
                                    <div>
                                        <label className="label">
                                            考试分数
                                        </label>
                                        <input
                                            className="input"
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={addExamScore}
                                            onChange={(e) =>
                                                setAddExamScore(e.target.value)
                                            }
                                            placeholder="请输入考试分数"
                                        />
                                        {addExamScore && !isNaN(Number(addExamScore)) && (() => {
                                            const score = Number(addExamScore)
                                            const matched = examRules.find(r => score >= r.min && score <= r.max)
                                            if (matched) {
                                                return (
                                                    <p className={`text-sm mt-1 font-medium ${matched.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                        匹配规则：{matched.min}-{matched.max}分，{matched.points >= 0 ? '+' : ''}{matched.points} 积分
                                                    </p>
                                                )
                                            }
                                            return (
                                                <p className="text-xs text-amber-500 mt-1">
                                                    未找到对应积分规则
                                                </p>
                                            )
                                        })()}
                                    </div>
                                ) : (
                                    <>
                                        <div>
                                            <label className="label">
                                                评分等级
                                            </label>
                                            <div className="flex gap-2 flex-wrap">
                                                {gradeOptions.map((g) => (
                                                    <button
                                                        key={g}
                                                        onClick={() =>
                                                            setAddGrade(g)
                                                        }
                                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                                                            addGrade === g
                                                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                                        }`}>
                                                        {g}
                                                    </button>
                                                ))}
                                            </div>
                                            {addGrade === 'E' && (
                                                <p className="text-xs text-red-500 mt-1">
                                                    E 等级为未完成，扣 50 分
                                                </p>
                                            )}
                                        </div>
                                    </>
                                )}
                                {addCategory !== 'custom' && (
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <label className="label">
                                                备注（可选）
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setRemarkSettingsText(
                                                        remarkOptions,
                                                    )
                                                    setShowRemarkSettings(
                                                        !showRemarkSettings,
                                                    )
                                                }}
                                                className="text-xs text-indigo-500 hover:text-indigo-700">
                                                {showRemarkSettings
                                                    ? '收起选项'
                                                    : '设置选项'}
                                            </button>
                                        </div>
                                        <input
                                            className="input"
                                            value={addRemark}
                                            onChange={(e) =>
                                                setAddRemark(e.target.value)
                                            }
                                            placeholder="请输入备注"
                                        />
                                        {showRemarkSettings && (
                                            <div className="mt-2">
                                                <textarea
                                                    className="input min-h-[100px] resize-y text-sm"
                                                    value={
                                                        remarkSettingsText
                                                    }
                                                    onChange={(e) =>
                                                        setRemarkSettingsText(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="每行一个选项"
                                                    rows={5}
                                                />
                                                <div className="flex justify-end mt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setRemarkOptions(
                                                                remarkSettingsText,
                                                            )
                                                            localStorage.setItem(
                                                                'remarkOptions',
                                                                remarkSettingsText,
                                                            )
                                                            setShowRemarkSettings(
                                                                false,
                                                            )
                                                        }}
                                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                                                        保存选项
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        {!showRemarkSettings &&
                                            remarkTags.length > 0 && (
                                                <div className="flex gap-1.5 flex-wrap mt-2">
                                                    {remarkTags.map(
                                                        (tag) => (
                                                            <button
                                                                key={tag}
                                                                type="button"
                                                                onClick={() =>
                                                                    setAddRemark(
                                                                        addRemark
                                                                            ? addRemark +
                                                                                  '、' +
                                                                                  tag
                                                                            : tag,
                                                                    )
                                                                }
                                                                className="px-2 py-1 text-xs rounded-md border border-gray-200 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300 transition-colors">
                                                                {tag}
                                                            </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                )}
                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        onClick={() => setShowAdd(false)}
                                        className="btn-outline">
                                        取消
                                    </button>
                                    <button
                                        onClick={handleAdd}
                                        disabled={
                                            adding ||
                                            (addCategory === 'custom' &&
                                                !addCustomRuleId) ||
                                            (addCategory === 'exam' &&
                                                (!addExamScore ||
                                                    isNaN(Number(addExamScore))))
                                        }
                                        className="btn-primary">
                                        {adding ? '添加中...' : '确认添加'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
