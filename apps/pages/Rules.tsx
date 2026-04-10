import { useState, useEffect } from 'react'
import { rulesApi } from '../lib/api'
import type {
    AllRules,
    HomeworkGradeRule,
    ExamRuleRange,
    ExchangeItemRule,
    CustomRule,
} from '../lib/types'
import { useSnackbar } from '../components/Snackbar'
import { Trash2, Plus } from 'lucide-react'

type TabKey = 'homework' | 'exam' | 'exchange' | 'custom'

const tabs: { key: TabKey; label: string }[] = [
    { key: 'homework', label: '作业评分' },
    { key: 'exam', label: '单元测评' },
    { key: 'exchange', label: '积分兑换' },
    { key: 'custom', label: '自定义规则' },
]

const defaultRules: AllRules = {
    homework: [],
    exam: {
        ranges: [],
        monthlyBasePoints: 500,
        minimumPointsForPrivileges: 100,
    },
    exchange: [],
    custom: [],
}

export default function Rules() {
    const { showSnackbar } = useSnackbar()
    const [rules, setRules] = useState<AllRules>(defaultRules)
    const [activeTab, setActiveTab] = useState<TabKey>('homework')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        async function load() {
            try {
                // Load from separate keys
                const [
                    homeworkData,
                    examData,
                    exchangeData,
                    customData,
                    systemData,
                ] = await Promise.all([
                    rulesApi.get('homework').catch(() => null),
                    rulesApi.get('exam').catch(() => null),
                    rulesApi.get('exchange').catch(() => null),
                    rulesApi.get('custom').catch(() => null),
                    rulesApi.get('system').catch(() => null),
                ])

                const allRules = { ...defaultRules }

                // homework
                if (homeworkData) {
                    const hw = homeworkData as unknown
                    if (Array.isArray(hw)) {
                        allRules.homework = hw as HomeworkGradeRule[]
                    } else if (hw && typeof hw === 'object') {
                        // Support old object format {A+: 50}
                        allRules.homework = Object.entries(
                            hw as Record<string, unknown>,
                        ).map(([grade, points]) => ({
                            grade,
                            points: Number(points),
                        }))
                    }
                }

                // exam
                if (examData) {
                    const ex = examData as Record<string, unknown>
                    if (ex.ranges || Array.isArray(ex)) {
                        allRules.exam = {
                            ranges: (Array.isArray(ex)
                                ? ex
                                : ex.ranges) as ExamRuleRange[],
                            monthlyBasePoints: Number(
                                ex.monthlyBasePoints ?? 500,
                            ),
                            minimumPointsForPrivileges: Number(
                                ex.minimumPointsForPrivileges ?? 500,
                            ),
                        }
                    }
                }

                // system (overrides exam's monthlyBasePoints/minimumPointsForPrivileges)
                if (systemData) {
                    const sys = systemData as Record<string, unknown>
                    if (sys.monthlyBasePoints !== undefined)
                        allRules.exam.monthlyBasePoints = Number(
                            sys.monthlyBasePoints,
                        )
                    if (sys.minimumPointsForPrivileges !== undefined)
                        allRules.exam.minimumPointsForPrivileges = Number(
                            sys.minimumPointsForPrivileges,
                        )
                }

                // exchange
                if (exchangeData) {
                    const exSrc = exchangeData as unknown
                    if (Array.isArray(exSrc)) {
                        allRules.exchange = (
                            exSrc as Record<string, unknown>[]
                        ).map((item) => {
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
                                key: String(item.key ?? ''),
                                label: String(item.label ?? ''),
                                points: Number(item.points ?? 1),
                                ratio,
                                unit,
                            } as ExchangeItemRule
                        })
                    } else if (exSrc && typeof exSrc === 'object') {
                        // Old object format: {tv: {points, minutes}, ...}
                        const defaultLabels: Record<string, string> = {
                            tv: '看电视',
                            device: '用设备',
                            cash: '换现金',
                        }
                        allRules.exchange = Object.entries(
                            exSrc as Record<string, unknown>,
                        ).map(([key, val]) => {
                            const item = val as Record<string, unknown>
                            const minutes =
                                item.minutes != null
                                    ? Number(item.minutes)
                                    : undefined
                            const yuan =
                                item.yuan != null
                                    ? Number(item.yuan)
                                    : undefined
                            // Already has ratio/unit
                            if (item.ratio !== undefined) {
                                return {
                                    key,
                                    label:
                                        (item.label as string) ??
                                        defaultLabels[key] ??
                                        key,
                                    points: Number(item.points ?? 1),
                                    ratio: Number(item.ratio),
                                    unit: (item.unit as string) ?? '次',
                                }
                            }
                            // Old format: convert minutes/yuan to ratio+unit
                            if (minutes !== undefined) {
                                return {
                                    key,
                                    label:
                                        (item.label as string) ??
                                        defaultLabels[key] ??
                                        key,
                                    points: Number(item.points ?? 1),
                                    ratio: minutes,
                                    unit: '分钟',
                                }
                            }
                            if (yuan !== undefined) {
                                return {
                                    key,
                                    label:
                                        (item.label as string) ??
                                        defaultLabels[key] ??
                                        key,
                                    points: Number(item.points ?? 1),
                                    ratio: yuan,
                                    unit: '元',
                                }
                            }
                            return {
                                key,
                                label:
                                    (item.label as string) ??
                                    defaultLabels[key] ??
                                    key,
                                points: Number(item.points ?? 1),
                                ratio: 1,
                                unit: '次',
                            }
                        })
                    }
                }

                // custom
                if (customData && Array.isArray(customData)) {
                    allRules.custom = customData as CustomRule[]
                }

                setRules(allRules)
            } catch (err) {
                console.error('Failed to load rules:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        try {
            // Save to separate keys
            await Promise.all([
                rulesApi.update(
                    'homework',
                    rules.homework as unknown as Record<string, unknown>,
                ),
                rulesApi.update('exam', {
                    ranges: rules.exam.ranges,
                } as unknown as Record<string, unknown>),
                rulesApi.update(
                    'exchange',
                    rules.exchange as unknown as Record<string, unknown>,
                ),
                rulesApi.update(
                    'custom',
                    rules.custom as unknown as Record<string, unknown>,
                ),
                rulesApi.update('system', {
                    monthlyBasePoints: rules.exam.monthlyBasePoints,
                    minimumPointsForPrivileges:
                        rules.exam.minimumPointsForPrivileges,
                } as unknown as Record<string, unknown>),
            ])
            showSnackbar('规则保存成功！')
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

    // ===== Homework handlers =====
    const updateHomeworkGrade = (
        index: number,
        field: 'grade' | 'points',
        value: string | number,
    ) => {
        setRules((prev) => {
            const homework = [...prev.homework]
            homework[index] = { ...homework[index], [field]: value }
            return { ...prev, homework }
        })
    }

    const addHomeworkGrade = () => {
        setRules((prev) => ({
            ...prev,
            homework: [...prev.homework, { grade: '', points: 0 }],
        }))
    }

    const removeHomeworkGrade = (index: number) => {
        setRules((prev) => ({
            ...prev,
            homework: prev.homework.filter((_, i) => i !== index),
        }))
    }

    // ===== Exam handlers =====
    const updateExamRange = (
        index: number,
        field: 'min' | 'max' | 'points',
        value: number,
    ) => {
        setRules((prev) => {
            const ranges = [...prev.exam.ranges]
            ranges[index] = { ...ranges[index], [field]: value }
            return { ...prev, exam: { ...prev.exam, ranges } }
        })
    }

    const addExamRange = () => {
        setRules((prev) => ({
            ...prev,
            exam: {
                ...prev.exam,
                ranges: [...prev.exam.ranges, { min: 0, max: 0, points: 0 }],
            },
        }))
    }

    const removeExamRange = (index: number) => {
        setRules((prev) => ({
            ...prev,
            exam: {
                ...prev.exam,
                ranges: prev.exam.ranges.filter((_, i) => i !== index),
            },
        }))
    }

    const updateExamBase = (
        field: 'monthlyBasePoints' | 'minimumPointsForPrivileges',
        value: number,
    ) => {
        setRules((prev) => ({
            ...prev,
            exam: { ...prev.exam, [field]: value },
        }))
    }

    // ===== Exchange handlers =====
    const updateExchangeItem = (
        index: number,
        field: keyof ExchangeItemRule,
        value: string | number | undefined,
    ) => {
        setRules((prev) => {
            const exchange = [...prev.exchange]
            exchange[index] = { ...exchange[index], [field]: value }
            return { ...prev, exchange }
        })
    }

    const addExchangeItem = () => {
        setRules((prev) => ({
            ...prev,
            exchange: [
                ...prev.exchange,
                { key: '', label: '', points: 1, ratio: 1, unit: '分钟' },
            ],
        }))
    }

    const removeExchangeItem = (index: number) => {
        setRules((prev) => ({
            ...prev,
            exchange: prev.exchange.filter((_, i) => i !== index),
        }))
    }

    // ===== Custom handlers =====
    const updateCustomRule = (
        index: number,
        field: keyof CustomRule,
        value: string | number,
    ) => {
        setRules((prev) => {
            const custom = [...prev.custom]
            custom[index] = { ...custom[index], [field]: value }
            return { ...prev, custom }
        })
    }

    const addCustomRule = () => {
        setRules((prev) => ({
            ...prev,
            custom: [
                ...prev.custom,
                { name: '', type: 'earn', points: 0, description: '' },
            ],
        }))
    }

    const removeCustomRule = (index: number) => {
        setRules((prev) => ({
            ...prev,
            custom: prev.custom.filter((_, i) => i !== index),
        }))
    }

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
                <h2 className="text-2xl font-bold text-gray-900">规则配置</h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn-primary">
                    {saving ? '保存中...' : '保存规则'}
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                            activeTab === tab.key
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                        }`}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="card">
                {activeTab === 'homework' && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            作业评分积分
                        </h3>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        等级
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        积分
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-500 font-medium w-16">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.homework.map((rule, i) => (
                                    <tr
                                        key={i}
                                        className="border-b border-gray-50">
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-20"
                                                value={rule.grade}
                                                onChange={(e) =>
                                                    updateHomeworkGrade(
                                                        i,
                                                        'grade',
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="等级"
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-24"
                                                type="number"
                                                value={rule.points}
                                                onChange={(e) =>
                                                    updateHomeworkGrade(
                                                        i,
                                                        'points',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                            <button
                                                onClick={() =>
                                                    removeHomeworkGrade(i)
                                                }
                                                className="text-red-400 hover:text-red-600 transition-colors"
                                                title="删除">
                                                <Trash2 className="w-4 h-4 inline" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button
                            onClick={addHomeworkGrade}
                            className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            添加等级
                        </button>
                    </div>
                )}

                {activeTab === 'exam' && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            单元测评积分
                        </h3>
                        <table className="w-full text-sm mb-4">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        最低分
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        最高分
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        积分
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-500 font-medium w-16">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.exam.ranges.map((range, i) => (
                                    <tr
                                        key={i}
                                        className="border-b border-gray-50">
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-20"
                                                type="number"
                                                value={range.min}
                                                onChange={(e) =>
                                                    updateExamRange(
                                                        i,
                                                        'min',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-20"
                                                type="number"
                                                value={range.max}
                                                onChange={(e) =>
                                                    updateExamRange(
                                                        i,
                                                        'max',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-24"
                                                type="number"
                                                value={range.points}
                                                onChange={(e) =>
                                                    updateExamRange(
                                                        i,
                                                        'points',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                            <button
                                                onClick={() =>
                                                    removeExamRange(i)
                                                }
                                                className="text-red-400 hover:text-red-600 transition-colors"
                                                title="删除">
                                                <Trash2 className="w-4 h-4 inline" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button
                            onClick={addExamRange}
                            className="mb-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            添加区间
                        </button>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="label">月初始积分</label>
                                <input
                                    className="input w-32"
                                    type="number"
                                    value={rules.exam.monthlyBasePoints}
                                    onChange={(e) =>
                                        updateExamBase(
                                            'monthlyBasePoints',
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </div>
                            <div>
                                <label className="label">特权最低积分</label>
                                <input
                                    className="input w-32"
                                    type="number"
                                    value={
                                        rules.exam.minimumPointsForPrivileges
                                    }
                                    onChange={(e) =>
                                        updateExamBase(
                                            'minimumPointsForPrivileges',
                                            Number(e.target.value),
                                        )
                                    }
                                />
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'exchange' && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            积分兑换规则
                        </h3>
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        标识(key)
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        名称
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        积分
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        比例
                                    </th>
                                    <th className="text-left py-2 px-3 text-gray-500 font-medium">
                                        单位
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-500 font-medium w-16">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.exchange.map((item, i) => (
                                    <tr
                                        key={i}
                                        className="border-b border-gray-50">
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-20"
                                                value={item.key}
                                                onChange={(e) =>
                                                    updateExchangeItem(
                                                        i,
                                                        'key',
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="tv"
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-24"
                                                value={item.label}
                                                onChange={(e) =>
                                                    updateExchangeItem(
                                                        i,
                                                        'label',
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="看电视"
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-16"
                                                type="number"
                                                value={item.points}
                                                onChange={(e) =>
                                                    updateExchangeItem(
                                                        i,
                                                        'points',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-16"
                                                type="number"
                                                value={item.ratio}
                                                onChange={(e) =>
                                                    updateExchangeItem(
                                                        i,
                                                        'ratio',
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        </td>
                                        <td className="py-2 px-3">
                                            <input
                                                className="input w-16"
                                                value={item.unit}
                                                onChange={(e) =>
                                                    updateExchangeItem(
                                                        i,
                                                        'unit',
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="分钟"
                                            />
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                            <button
                                                onClick={() =>
                                                    removeExchangeItem(i)
                                                }
                                                className="text-red-400 hover:text-red-600 transition-colors"
                                                title="删除">
                                                <Trash2 className="w-4 h-4 inline" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <button
                            onClick={addExchangeItem}
                            className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            添加兑换项
                        </button>
                    </div>
                )}

                {activeTab === 'custom' && (
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                            自定义规则
                        </h3>
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
                                        描述
                                    </th>
                                    <th className="text-right py-2 px-3 text-gray-500 font-medium w-16">
                                        操作
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.custom.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="py-6 text-center text-gray-400">
                                            暂无自定义规则
                                        </td>
                                    </tr>
                                ) : (
                                    rules.custom.map((rule, i) => (
                                        <tr
                                            key={i}
                                            className="border-b border-gray-50">
                                            <td className="py-2 px-3">
                                                <input
                                                    className="input w-28"
                                                    value={rule.name}
                                                    onChange={(e) =>
                                                        updateCustomRule(
                                                            i,
                                                            'name',
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="规则名"
                                                />
                                            </td>
                                            <td className="py-2 px-3">
                                                <select
                                                    className="input w-20"
                                                    value={rule.type}
                                                    onChange={(e) =>
                                                        updateCustomRule(
                                                            i,
                                                            'type',
                                                            e.target.value,
                                                        )
                                                    }>
                                                    <option value="earn">
                                                        加分
                                                    </option>
                                                    <option value="deduct">
                                                        扣分
                                                    </option>
                                                </select>
                                            </td>
                                            <td className="py-2 px-3">
                                                <input
                                                    className="input w-20"
                                                    type="number"
                                                    value={rule.points}
                                                    onChange={(e) =>
                                                        updateCustomRule(
                                                            i,
                                                            'points',
                                                            Number(
                                                                e.target.value,
                                                            ),
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input
                                                    className="input w-36"
                                                    value={rule.description}
                                                    onChange={(e) =>
                                                        updateCustomRule(
                                                            i,
                                                            'description',
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="描述"
                                                />
                                            </td>
                                            <td className="py-2 px-3 text-right">
                                                <button
                                                    onClick={() =>
                                                        removeCustomRule(i)
                                                    }
                                                    className="text-red-400 hover:text-red-600 transition-colors"
                                                    title="删除">
                                                    <Trash2 className="w-4 h-4 inline" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                        <button
                            onClick={addCustomRule}
                            className="mt-3 text-sm text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center gap-1">
                            <Plus className="w-4 h-4" />
                            添加规则
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
