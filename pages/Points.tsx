import { useState, useEffect, useCallback } from 'react'
import { pointsApi, optionsAPI } from '@apps/lib/api'
import type {
    PointRecord,
    HomeworkGradeRule,
    CustomRule,
    ExamRuleRange,
} from '@apps/lib/types'
import { getCurrentMonth, isAdmin, formatErrorMessage } from '@apps/lib/utils'
import { useSnackbar } from '@components/Snackbar'
import PointsListTable from '@layout/PointsListTable'
import PointsModalAdd from '@pages/layout/PointsModalAdd'
import Loading from '@components/Loading'

export default function Points() {
    const { showSnackbar } = useSnackbar()
    const [records, setRecords] = useState<PointRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [filterType, setFilterType] = useState<string>('')
    const [filterMonth, setFilterMonth] = useState(getCurrentMonth())

    // Add record modal
    const [showModal, setShowModal] = useState(false)
    const [gradeOptionsFromRules, setGradeOptionsFromRules] = useState<
        string[]
    >([])
    const [customRules, setCustomRules] = useState<CustomRule[]>([])
    const [examRules, setExamRules] = useState<ExamRuleRange[]>([])

    const load = async () => {
        try {
            const params: Record<string, string> = {}
            if (filterType) params.type = filterType
            if (filterMonth) params.month = filterMonth

            const [recordsData, homeworkData, customData, examData] =
                await Promise.all([
                    pointsApi.list(
                        Object.keys(params).length > 0 ? params : undefined,
                    ),
                    optionsAPI.get('homework').catch(() => null),
                    optionsAPI.get('custom').catch(() => null),
                    optionsAPI.get('exam').catch(() => null),
                ])
            setRecords(recordsData)
            // Extract grade options from homework rules
            if (homeworkData) {
                const hw = homeworkData as unknown
                if (Array.isArray(hw)) {
                    const grades = (hw as HomeworkGradeRule[])
                        .map((g) => g.grade)
                        .filter(Boolean)
                    if (grades.length > 0) setGradeOptionsFromRules(grades)
                } else if (hw && typeof hw === 'object') {
                    const grades = Object.keys(hw as Record<string, unknown>)
                    if (grades.length > 0) setGradeOptionsFromRules(grades)
                }
            }
            // Extract custom rules
            if (customData && Array.isArray(customData)) {
                const sorted = [...(customData as CustomRule[])]
                sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
                setCustomRules(sorted)
            }
            // Extract exam rules
            if (examData) {
                const ex = examData as unknown
                if (Array.isArray(ex)) {
                    setExamRules(ex as ExamRuleRange[])
                } else if (
                    ex &&
                    typeof ex === 'object' &&
                    Array.isArray((ex as Record<string, unknown>).ranges)
                ) {
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

    const handleAdd = useCallback(
        async (params: {
            category: string
            grade: string
            remark: string
            customRuleId: string
            examScore: string
        }) => {
            try {
                const remark = params.remark || ''
                if (params.category === 'custom') {
                    if (!params.customRuleId) {
                        showSnackbar('请选择一条自定义规则', 'info')
                        return
                    }
                    await pointsApi.createByCustomRule(
                        params.customRuleId,
                        remark,
                    )
                } else if (params.category === 'exam') {
                    const score = Number(params.examScore)
                    if (!params.examScore || isNaN(score)) {
                        showSnackbar('请输入有效分数', 'info')
                        return
                    }
                    await pointsApi.createByExamScore(score, remark)
                } else {
                    await pointsApi.createByGrade(
                        params.category,
                        params.grade,
                        remark,
                    )
                }
                showSnackbar('添加成功')
                load()
            } catch (err) {
                showSnackbar('添加失败: ' + formatErrorMessage(err), 'error')
                throw err
            }
        },
        [showSnackbar],
    )
    if (loading) {
        return <Loading />
    }

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2>积分记录</h2>
                    {isAdmin() && (
                        <button
                            onClick={() => setShowModal(true)}
                            className="btn btn-primary">
                            添加记录
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="card">
                    <div className="flex items-center gap-4">
                        <div>
                            <label className="label sr-only">类型</label>
                            <select
                                className="regular-text"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}>
                                <option value="">全部</option>
                                <option value="earn">加分</option>
                                <option value="deduct">扣分</option>
                            </select>
                        </div>
                        <div>
                            <label className="label sr-only">月份</label>
                            <input
                                className="regular-text"
                                type="month"
                                value={filterMonth}
                                onChange={(e) => setFilterMonth(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <PointsListTable records={records} />
            </div>

            <PointsModalAdd
                open={showModal}
                onCancel={() => setShowModal(false)}
                onConfirm={handleAdd}
                gradeOptionsFromRules={gradeOptionsFromRules}
                customRules={customRules}
                examRules={examRules}
            />
        </>
    )
}
