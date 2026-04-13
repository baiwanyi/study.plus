import { useState, useEffect, type ReactNode } from 'react'
import type { TaskGrade, CustomRule, ExamRuleRange } from '@apps/lib/types'
import { remarkApi } from '@apps/lib/api'
import Modal from '@apps/components/Modal'
import Tabs from '@apps/components/Tabs'

const defaultGradeOptions: TaskGrade[] = ['A+', 'A', 'B', 'C', 'D', 'E']
const categoryOptions: { key: string; label: string }[] = [
    { key: 'exam', label: '单元测评' },
    { key: 'submission', label: '作业批改' },
    { key: 'custom', label: '自定义规则' },
]
const CustomRulesOptions: { key: string; label: string }[] = [
    { key: 'earn', label: '加分项' },
    { key: 'deduct', label: '扣分项' },
]

interface RemarkOptions {
    exam: string
    homework: string
}

interface PointsModalAddProps {
    open: boolean
    onCancel: () => void
    onConfirm: (params: {
        category: string
        grade: string
        remark: string
        customRuleId: string
        examScore: string
    }) => Promise<void>
    gradeOptionsFromRules: string[]
    customRules: CustomRule[]
    examRules: ExamRuleRange[]
}

/**
 * 添加积分记录的模态框组
 * 支持三种积分添加方式：考试评分、作业等级评定、自定义规则
 *
 * @param open - 模态框是否打开
 * @param onCancel - 取消操作回调函数
 * @param onConfirm - 确认添加积分回调函数，接收积分记录数据对象
 * @param gradeOptionsFromRules - 从规则中获取的等级选项列表
 * @param customRules - 自定义积分规则列表
 * @param examRules - 考试评分规则列表
 */
export default function PointsModalAdd({
    open,
    onCancel,
    onConfirm,
    gradeOptionsFromRules,
    customRules,
    examRules,
}: PointsModalAddProps) {
    /**
     * 分类选项状态
     * 用于管理不同类型（考试、作业、自定义）的分类选项
     */
    const [addCategory, setAddCategory] = useState('exam')

    /**
     * 等级选项状态
     * 用于管理不同类型（考试、作业）的等级选项
     */
    const [addGrade, setAddGrade] = useState<string>('A')

    /**
     * 备注选项状态
     * 用于管理不同类型（考试、作业）的备注内容
     */
    const [addRemark, setAddRemark] = useState('')

    /**
     * 加载状态
     * 用于控制按钮的加载状态
     */
    const [loading, setLoading] = useState(false)

    /**
     * 等级选项状态
     * 用于管理不同类型（考试、作业）的等级选项
     */
    const [gradeOptions, setGradeOptions] =
        useState<string[]>(defaultGradeOptions)

    /**
     * 自定义规则选项状态
     * 用于管理不同类型（加分、扣分）的自定义规则
     */
    const [addCustomRuleId, setAddCustomRuleId] = useState<string>('')

    /**
     * 自定义规则选项状态
     * 用于管理不同类型（加分、扣分）的自定义规则
     */
    const [customRuleTab, setCustomRuleTab] = useState<'earn' | 'deduct'>(
        'earn',
    )

    /**
     * 考试分数选项状态
     * 用于管理不同类型（考试、作业）的考试分数
     */
    const [addExamScore, setAddExamScore] = useState<string>('')

    /**
     * 备注选项状态
     * 用于管理不同类型（考试、作业）的备注内容
     */
    const [remarkOptions, setRemarkOptions] = useState<RemarkOptions>({
        exam: '',
        homework: '',
    })

    /**
     * 备注设置状态
     * 用于管理备注设置的显示与隐藏
     */
    const [showRemarkSettings, setShowRemarkSettings] = useState(false)

    /**
     * 备注设置文本状态
     * 用于管理备注设置的文本内容
     */
    const [remarkSettingsText, setRemarkSettingsText] = useState('')

    /**
     * 加载备注选项
     * 用于在组件加载时加载备注选项
     */
    useEffect(() => {
        remarkApi.get().then(setRemarkOptions)
    }, [])

    /**
     * 当前备注选项
     * 用于管理不同类型（考试、作业）的备注选项
     */
    const currentRemarkOptions =
        addCategory === 'submission'
            ? remarkOptions.homework
            : remarkOptions.exam

    /**
     * 备注标签
     * 用于管理不同类型（考试、作业）的备注标签
     */
    const remarkTags = currentRemarkOptions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)

    /**
     * 是否禁用添加按钮
     * 用于管理添加按钮的禁用状态
     */
    const isDisabled =
        loading ||
        !addRemark ||
        (addCategory === 'custom' && !addCustomRuleId) ||
        (addCategory === 'exam' &&
            (!addExamScore || isNaN(Number(addExamScore))))

    /**
     * 如果从规则中获取的等级选项列表不为空，则更新等级选项列表
     */
    if (
        gradeOptionsFromRules.length > 0 &&
        JSON.stringify(gradeOptions) !== JSON.stringify(gradeOptionsFromRules)
    ) {
        setGradeOptions(gradeOptionsFromRules)
    }

    /**
     * 添加积分操作函数
     */
    const handleAddPoints = async () => {
        setLoading(true)
        try {
            await onConfirm({
                category: addCategory,
                grade: addGrade,
                remark: addRemark,
                customRuleId: addCustomRuleId,
                examScore: addExamScore,
            })
            // 重置状态
            setAddRemark('')
            setAddGrade(gradeOptions[1] || 'A')
            setAddCustomRuleId('')
            setAddExamScore('')
            onCancel()
        } finally {
            setLoading(false)
        }
    }

    /**
     * 保存备注设置操作函数
     */
    const handleSaveRemarks = async () => {
        const newOptions = {
            ...remarkOptions,
            [addCategory === 'submission' ? 'homework' : 'exam']:
                remarkSettingsText,
        }
        setRemarkOptions(newOptions)
        await remarkApi.update(newOptions)
        setShowRemarkSettings(false)
    }

    /**
     * 渲染等级选择器
     */
    const renderGradeSelector = (
        <div className="space-y-2">
            <label className="label">评分等级</label>
            <div className="flex gap-2 flex-wrap">
                {gradeOptions.map((grade) => (
                    <button
                        key={grade}
                        onClick={() => setAddGrade(grade)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                            addGrade === grade
                                ? 'border-primary bg-primary text-white'
                                : 'border-gray-200 text-foreground hover:bg-gray-100'
                        }`}>
                        {grade}
                    </button>
                ))}
            </div>
            {addGrade === 'E' && (
                <p className="text-xs text-danger">E 等级为未完成，扣 50 分</p>
            )}
        </div>
    )

    /**
     * 渲染考试分数选择器
     */
    const renderExamRules = (
        <div className="space-y-2">
            <label className="label">考试分数</label>
            <input
                className="regular-text"
                type="number"
                min="0"
                max="100"
                value={addExamScore}
                onChange={(e) => setAddExamScore(e.target.value)}
                placeholder="请输入考试分数"
            />
            {addExamScore &&
                !isNaN(Number(addExamScore)) &&
                (() => {
                    const score = Number(addExamScore)
                    const matched = examRules.find(
                        (r) => score >= r.min && score <= r.max,
                    )
                    if (matched) {
                        return (
                            <p
                                className={`text-sm mt-1 font-medium ${matched.points >= 0 ? 'text-success' : 'text-danger'}`}>
                                匹配规则：{matched.min}-{matched.max}
                                分，
                                {matched.points >= 0 ? '+' : ''}
                                {matched.points} 积分
                            </p>
                        )
                    }
                    return (
                        <p className="text-xs text-warning">
                            未找到对应积分规则
                        </p>
                    )
                })()}
        </div>
    )

    /**
     * 渲染自定义规则按钮
     *
     * @param ruleId - 规则 ID，用于按钮的 key 和选中状态判断
     * @param rule - 自定义规则对象，包含名称、类型和分数
     * @param idx - 规则在列表中的索引，用作备用 key
     * @param isSelected - 是否为选中状态，控制按钮样式
     * @returns 自定义规则按钮 JSX 元素
     */
    const renderCustomRulesButton = (
        ruleId: string,
        rule: CustomRule,
        idx: number,
        isSelected: boolean,
    ) => {
        return (
            <button
                key={ruleId || `rule-${idx}`}
                type="button"
                onClick={() => setAddCustomRuleId(ruleId)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isSelected
                        ? customRuleTab === 'earn'
                            ? 'border-success bg-success/10'
                            : 'border-danger bg-danger/10'
                        : 'border-gray-200 hover:bg-gray-50'
                }`}>
                <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900">
                        {rule.name}
                    </span>
                    <span
                        className={`text-sm font-bold ${rule.type === 'earn' ? 'text-success' : 'text-danger'}`}>
                        {rule.type === 'earn' ? '+' : '-'}
                        {rule.points}
                    </span>
                </div>
            </button>
        )
    }

    /**
     * 渲染自定义规则列表
     */
    const renderCustomRules = (
        <div className="space-y-2">
            <label className="label">选择自定义规则</label>
            {customRules.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">
                    暂无自定义规则，请先在规则管理中添加
                </p>
            ) : (
                <>
                    <Tabs
                        background="gray"
                        active={customRuleTab}
                        activeClassName="bg-white text-headline"
                        tabs={CustomRulesOptions}
                        onChange={(key) => {
                            setCustomRuleTab(key as 'earn' | 'deduct')
                            setAddCustomRuleId('')
                        }}
                    />
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                        {customRules.filter((r) => r.type === customRuleTab)
                            .length === 0 ? (
                            <p className="text-sm text-gray-400 py-4 text-center">
                                暂无
                                {customRuleTab === 'earn' ? '加分' : '扣分'}
                                规则
                            </p>
                        ) : (
                            customRules
                                .filter((r) => r.type === customRuleTab)
                                .map((rule, idx) => {
                                    const ruleId = rule.id ?? rule.name
                                    const isSelected =
                                        addCustomRuleId === ruleId
                                    return renderCustomRulesButton(
                                        ruleId,
                                        rule,
                                        idx,
                                        isSelected,
                                    )
                                })
                        )}
                    </div>
                </>
            )}
        </div>
    )

    /**
     * 渲染备注设置
     */
    const renderRemarks = addCategory !== 'custom' && (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="label">备注标签</label>
                <button
                    type="button"
                    onClick={() => {
                        setRemarkSettingsText(currentRemarkOptions)
                        setShowRemarkSettings(!showRemarkSettings)
                    }}
                    className="text-xs btn-link">
                    {showRemarkSettings ? '收起选项' : '设置选项'}
                </button>
            </div>
            <input
                className="regular-text"
                value={addRemark}
                onChange={(e) => setAddRemark(e.target.value)}
                placeholder="请输入备注"
            />
            {showRemarkSettings && (
                <div className="space-y-2">
                    <p className="text-xs text-muted">
                        {addCategory === 'submission' ? '作业批改' : '单元测评'}
                        备注选项（每行一个）
                    </p>
                    <textarea
                        className="regular-text"
                        value={remarkSettingsText}
                        onChange={(e) => setRemarkSettingsText(e.target.value)}
                        placeholder="每行一个选项"
                        rows={5}
                    />
                    <div className="flex justify-end mt-1">
                        <button
                            type="button"
                            onClick={handleSaveRemarks}
                            className="text-xs btn-outline">
                            保存选项
                        </button>
                    </div>
                </div>
            )}
            {!showRemarkSettings && remarkTags.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                    {remarkTags.map((tag) => (
                        <button
                            key={tag}
                            type="button"
                            onClick={() =>
                                setAddRemark(
                                    addRemark ? addRemark + '、' + tag : tag,
                                )
                            }
                            className="text-xs btn-outline">
                            {tag}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )

    /**
     * 根据当前分类渲染内容
     */
    const categoryContent: Record<string, ReactNode> = {
        exam: renderExamRules,
        submission: renderGradeSelector,
        custom: renderCustomRules,
    }

    return (
        <Modal
            open={open}
            title="添加积分记录"
            isDisabled={isDisabled}
            isLoading={loading}
            onCancel={onCancel}
            onConfirm={handleAddPoints}
            confirmLabel="确认添加">
            <Tabs
                background="gray"
                active={addCategory}
                activeClassName="bg-white text-headline"
                tabs={categoryOptions}
                onChange={(key) => {
                    setAddCategory(key)
                    setAddCustomRuleId('')
                    setAddExamScore('')
                    setShowRemarkSettings(false)
                }}
            />
            {categoryContent[addCategory]}
            {renderRemarks}
        </Modal>
    )
}
