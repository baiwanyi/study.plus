'use client'
/**
 * 测验弹窗右侧操作栏组件：提供【历史测验】【错题本】两个面板的切换展示。
 * 复用约定：数据由父组件经 TanStack Query hooks 注入，本组件为纯展示不自行请求；
 * 错题卡片 WrongQuestionCard 导出供全局错题本复用；答案还原复用 @apps/utils/quizFormat。
 * 关键约束：历史列表仅展示已提交测验；点选历史条目仅回调通知父组件切换左侧内容。
 */
import { BookX, ClipboardList, History, Loader2, Timer, X } from 'lucide-react'
import { formatAnswerText, stripOptionPrefix } from '@apps/utils/quizFormat'
import { MarkdownView } from '@components/MarkdownView'
import { STUDYNODES_QUIZ_TYPE_LABELS } from '@shared/types'
import { decodeMultiSelection, formatDate } from '@shared/utils'
import type { StudynotesQuizHistoryItem, WrongQuestion } from '@shared/types'
import type { FC, ReactNode } from 'react'

export type QuizSidePanelName = 'none' | 'history' | 'wrong'

interface QuizSidePanelProps {
    panel: QuizSidePanelName
    history: StudynotesQuizHistoryItem[]
    selectedQuizId: number | null
    isHistoryLoading: boolean
    /** 限时倒计时文案（mm:ss），仅作答态非空 */
    remainingText: string | null
    isTimeUrgent: boolean
    onTogglePanel: (panel: 'history' | 'wrong') => void
    onSelectHistory: (quizId: number) => void
    /** 返回当前测验视图（退出历史回看/错题本） */
    onShowQuiz: () => void
}

export const QuizSidePanel: FC<QuizSidePanelProps> = ({
    panel,
    history,
    selectedQuizId,
    isHistoryLoading,
    remainingText,
    isTimeUrgent,
    onTogglePanel,
    onSelectHistory,
    onShowQuiz,
}) => {
    // 历史测验展开列表；错题本内容在左侧主区域展示，右侧仅保留收起态入口（高亮当前激活项）
    if (panel === 'history') {
        return (
            <div className="sticky top-0 flex w-72 shrink-0 flex-col">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">
                        历史测验
                    </span>
                    <div className="flex items-center gap-1">
                        {remainingText && (
                            <CountdownBadge
                                remainingText={remainingText}
                                isTimeUrgent={isTimeUrgent}
                            />
                        )}
                        <button
                            type="button"
                            aria-label="收起面板"
                            onClick={() => onTogglePanel('history')}
                            className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer">
                            <X className="size-4" />
                        </button>
                    </div>
                </div>
                {isHistoryLoading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-gray-400" />
                    </div>
                ) : (
                    <HistoryList
                        history={history}
                        selectedQuizId={selectedQuizId}
                        onSelectHistory={onSelectHistory}
                    />
                )}
            </div>
        )
    }

    // 收起态：窄列入口按钮，激活面板对应按钮高亮；倒计时显示在按钮组下方
    // （history 展开态已由上方独立分支返回，此处历史按钮恒不高亮）
    return (
        <div className="sticky top-0 flex w-16 shrink-0 flex-col items-center gap-1 -mr-3">
            <PanelEntryButton
                icon={<ClipboardList className="size-5" />}
                label="测验"
                isActive={panel === 'none'}
                onClick={onShowQuiz}
            />
            <PanelEntryButton
                icon={<History className="size-5" />}
                label="历史"
                isActive={false}
                onClick={() => onTogglePanel('history')}
            />
            <PanelEntryButton
                icon={<BookX className="size-5" />}
                label="错题"
                isActive={panel === 'wrong'}
                onClick={() => onTogglePanel('wrong')}
            />
            {remainingText && (
                <CountdownBadge
                    remainingText={remainingText}
                    isTimeUrgent={isTimeUrgent}
                    vertical={true}
                />
            )}
        </div>
    )
}

/** 限时倒计时徽章：Timer 图标 + mm:ss；临近截止（≤5 分钟）红底脉冲提醒；vertical 用于窄列竖排 */
function CountdownBadge({
    remainingText,
    isTimeUrgent,
    vertical = false,
}: {
    remainingText: string
    isTimeUrgent: boolean
    vertical?: boolean
}) {
    return (
        <div
            className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium border-primary ${
                vertical ? 'flex-col' : ''
            } ${
                isTimeUrgent
                    ? 'animate-pulse bg-red-50 text-red-600'
                    : 'bg-gray-100 text-gray-600'
            }`}>
            <Timer className="size-4" />
            <span>{remainingText}</span>
        </div>
    )
}

/** 收起态面板入口按钮：图标 + 短文案竖排，激活时高亮 */
function PanelEntryButton({
    icon,
    label,
    isActive,
    onClick,
}: {
    icon: ReactNode
    label: string
    isActive: boolean
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex w-full flex-col items-center gap-0.5 rounded-md px-1 py-2 cursor-pointer ${
                isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}>
            {icon}
            <span className="text-xs">{label}</span>
        </button>
    )
}

/** 历史测验列表：时间 + 分数，选中项高亮，点选回调父组件回填左侧 */
function HistoryList({
    history,
    selectedQuizId,
    onSelectHistory,
}: {
    history: StudynotesQuizHistoryItem[]
    selectedQuizId: number | null
    onSelectHistory: (quizId: number) => void
}) {
    if (history.length === 0) {
        return <EmptyHint text="暂无已提交的测验" />
    }
    return (
        <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {history.map((item) => {
                // score 为 null 表示已提交但未批改，须显示「待批改」而非误兜底为 0 分
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectHistory(item.id)}
                        className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                            selectedQuizId === item.id
                                ? 'border-blue-400 bg-blue-50'
                                : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-gray-600">
                                {formatDate(item.submittedAt)}
                            </span>
                            {item.score === null ? (
                                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                                    待批改
                                </span>
                            ) : (
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        item.score < 80
                                            ? 'bg-red-50 text-red-700'
                                            : 'bg-green-50 text-green-700'
                                    }`}>
                                    {item.score} 分
                                </span>
                            )}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                            {item.score === null
                                ? '已提交，等待批改'
                                : `答对 ${item.correctCount ?? 0} 题`}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}

/** 面板空态提示 */
function EmptyHint({ text }: { text: string }) {
    return <p className="py-8 text-center text-xs text-gray-400">{text}</p>
}

interface WrongQuestionCardProps {
    item: WrongQuestion
    /** 是否展示来源课程（全局错题本使用） */
    showSource?: boolean
}

/** 客观题选项配色：选对绿 / 选错红 / 漏选正确项蓝描边 / 其余普通 */
function getOptionTone(isSelected: boolean, isCorrectOpt: boolean): string {
    if (isSelected && isCorrectOpt) return 'border-green-400 bg-green-50'
    if (isSelected) return 'border-red-400 bg-red-50'
    if (isCorrectOpt) return 'border-blue-300 bg-blue-50'
    return 'border-gray-200 bg-white'
}

/** 客观题全部选项列表：沿用测验只读态配色（我的选择红/绿、漏选正确项蓝描边、其余普通） */
function WrongOptionList({
    options,
    studentAnswer,
    correctAnswer,
}: {
    options: string[]
    studentAnswer: string
    correctAnswer: string
}) {
    const selected = decodeMultiSelection(studentAnswer)
    const correct = decodeMultiSelection(correctAnswer)
    return (
        <div className="space-y-1.5">
            {options.map((opt, i) => {
                const letter = String.fromCharCode('A'.charCodeAt(0) + i)
                const isSelected = selected.includes(letter)
                const isCorrectOpt = correct.includes(letter)
                return (
                    <div
                        key={letter}
                        className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${getOptionTone(isSelected, isCorrectOpt)}`}>
                        <span className="font-medium text-gray-800">
                            {letter}.
                        </span>
                        <span className="text-gray-800">
                            {stripOptionPrefix(opt)}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

/** 错题卡片：题目 / 客观题全部选项（带对错配色）/ 我的回答 / 参考答案 / 解析 */
export const WrongQuestionCard: FC<WrongQuestionCardProps> = ({
    item,
    showSource = false,
}) => {
    const isObjective = item.type === 'single' || item.type === 'multi'
    return (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-1.5">
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">
                    错题
                </span>
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                    {STUDYNODES_QUIZ_TYPE_LABELS[item.type]}
                </span>
            </div>
            <MarkdownView content={item.question} className="bg-transparent!" />
            {isObjective && item.options.length > 0 && (
                <WrongOptionList
                    options={item.options}
                    studentAnswer={item.studentAnswer}
                    correctAnswer={item.correctAnswer}
                />
            )}
            <div className="space-y-1.5">
                <p className="rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-600">
                    <span className="font-semibold">我的回答：</span>
                    {isObjective
                        ? formatAnswerText(item.options, item.studentAnswer)
                        : item.studentAnswer || '（未作答）'}
                </p>
                <p className="rounded-md bg-blue-50 px-2 py-1.5 text-sm text-blue-800">
                    <span className="font-semibold">参考答案：</span>
                    {isObjective
                        ? formatAnswerText(item.options, item.correctAnswer)
                        : item.correctAnswer}
                </p>
                {item.explanation && (
                    <div className="rounded-md bg-amber-50 px-2 py-1.5 text-sm text-amber-800">
                        <span className="font-semibold">解析：</span>
                        <MarkdownView
                            content={item.explanation}
                            className="text-sm! text-amber-800! bg-transparent!"
                        />
                    </div>
                )}
                <p className="px-2 text-xs text-gray-700">
                    {showSource && item.studyTopic && (
                        <span>来自课程「{item.studyTopic}」· </span>
                    )}
                    答错于 {formatDate(item.submittedAt)}
                </p>
            </div>
        </div>
    )
}
