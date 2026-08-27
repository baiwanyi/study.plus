'use client'
/**
 * 课程专属测验弹窗组件：管理测验生成/作答/提交/批改全流程展示，含 30 分钟限时
 * （以服务端 generatedAt 为基准续算，关闭重开不重置，到点自动提交批改）、
 * 右侧【历史测验】【错题本】操作栏、历史测验只读回看，以及错题本左栏宽版展示。
 * 复用约定：作答状态机复用 useStudynotesQuiz 及其查询 hooks；右侧栏复用 QuizSidePanel；
 * 答案还原复用 @apps/utils/quizFormat；限时倒计时（含超时通知）完整封装于 useQuizCountdown。
 * 关键约束：仅作答态（answering）计时，已提交/已批改停止；历史回看为纯只读，禁用作答与提交。
 */
import { useLayoutEffect, useMemo, useReducer, useRef } from 'react'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { formatAnswerText, stripOptionPrefix } from '@apps/utils/quizFormat'
import { MarkdownView } from '@components/MarkdownView'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { STUDYNODES_QUIZ_TYPE_LABELS } from '@shared/types'
import {
    decodeMultiSelection,
    encodeMultiSelection,
    formatDate,
} from '@shared/utils'
import { QuizSidePanel, WrongQuestionCard } from './components/QuizSidePanel'
import { useQuizCountdown } from './hooks/useQuizCountdown'
import {
    useStudynotesQuiz,
    useStudynotesQuizDetail,
    useStudynotesQuizHistory,
    useStudynotesQuizWrong,
} from './hooks/useStudynotesQuiz'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizQuestionType,
    StudynotesQuizResult,
    WrongQuestion,
} from '@shared/types'
import type { FC } from 'react'
import { Loading } from '@apps/components/Loading'

type QuizStatus =
    | 'idle'
    | 'generating'
    | 'answering'
    | 'grading'
    | 'graded'
    | 'error'

type SidePanelName = 'none' | 'history' | 'wrong'

interface SidePanelState {
    panel: SidePanelName
    selectedQuizId: number | null
}

type SidePanelAction =
    | { type: 'TOGGLE_PANEL'; panel: 'history' | 'wrong' }
    | { type: 'SELECT_HISTORY'; quizId: number }
    | { type: 'RESET' }

const initialSidePanelState: SidePanelState = {
    panel: 'none',
    selectedQuizId: null,
}

type QuizConfirmAction = 'submit' | 'grade' | 'generate'

// 确认栏文案按动作映射，避免渲染层嵌套三元
const CONFIRM_LABELS: Record<QuizConfirmAction, string> = {
    submit: '提交答案',
    grade: '批改',
    generate: '重新测验',
}

// 按测验状态与视图解析确认栏动作：作答=提交答案、已提交未批改=批改、已批改=重新测验；
// 锁定/历史回看/错题本/空态视图返回 null（隐藏确认栏，空态由 EmptyState 自带按钮）
function resolveConfirmAction(
    canQuiz: boolean,
    isViewingHistory: boolean,
    panel: SidePanelName,
    quiz: StudynotesQuiz | null,
): QuizConfirmAction | null {
    if (!canQuiz || isViewingHistory || panel === 'wrong') {
        return null
    }
    if (!quiz) return null
    if (quiz.results) return 'generate'
    if (quiz.submittedAt) return 'grade'
    return 'submit'
}

// 右侧操作栏状态机：面板切换互斥且重置选中项，收起/重开弹窗时复位
function sidePanelReducer(
    state: SidePanelState,
    action: SidePanelAction,
): SidePanelState {
    switch (action.type) {
        case 'TOGGLE_PANEL':
            // 再次点击同一面板即收起；切换面板时清空历史选中项
            return state.panel === action.panel
                ? initialSidePanelState
                : { panel: action.panel, selectedQuizId: null }
        case 'SELECT_HISTORY':
            return { ...state, selectedQuizId: action.quizId }
        case 'RESET':
            return initialSidePanelState
        default:
            return state
    }
}

interface QuizModalEditorProps {
    open: boolean
    cardId: number | null
    canQuiz: boolean
    lessonTopic: string
    onClose: () => void
    onSaved?: () => void
}

export const QuizModalEditor: FC<QuizModalEditorProps> = ({
    open,
    cardId,
    canQuiz,
    lessonTopic,
    onClose,
    onSaved,
}) => {
    const { showSnackbar } = useSnackbar()
    const {
        status,
        quiz,
        answers,
        errorMsg,
        isEmpty,
        isSubmitted,
        setAnswer,
        generate,
        grade,
        submit,
    } = useStudynotesQuiz(
        cardId,
        canQuiz,
        () => {
            showSnackbar('答题内容已自动保存', 'success')
        },
        () => {
            showSnackbar('自动保存失败，请稍后重试', 'error')
        },
    )

    // === 右侧操作栏（历史测验/错题本）状态与数据 ===
    const [sidePanel, dispatchSidePanel] = useReducer(
        sidePanelReducer,
        initialSidePanelState,
    )

    const handleClose = () => {
        // 复位侧栏状态：selectedQuizId 指向当前课程的测验 ID，
        // 残留到其它课程的弹窗会因归属校验 404 导致历史视图永久 Loading
        dispatchSidePanel({ type: 'RESET' })
        onSaved?.()
        onClose()
    }
    const { data: history = [], isLoading: isHistoryLoading } =
        useStudynotesQuizHistory(cardId, open && sidePanel.panel === 'history')
    const { data: wrongQuestions = [], isLoading: isWrongLoading } =
        useStudynotesQuizWrong(cardId, open && sidePanel.panel === 'wrong')
    const isViewingHistory =
        sidePanel.panel === 'history' && sidePanel.selectedQuizId != null
    const { data: historyQuiz } = useStudynotesQuizDetail(
        cardId,
        isViewingHistory ? sidePanel.selectedQuizId : null,
    )
    // 底部确认栏按测验状态承载核心动作（解析逻辑见模块级 resolveConfirmAction）
    const confirmAction = resolveConfirmAction(
        canQuiz,
        isViewingHistory,
        sidePanel.panel,
        quiz,
    )

    const handleConfirm = async () => {
        if (confirmAction === 'submit') {
            const ok = await submit()
            if (ok) {
                showSnackbar('已提交，请点击「批改」查看结果', 'info')
            }
            return
        }
        if (confirmAction === 'grade') {
            await grade()
            return
        }
        if (confirmAction === 'generate') {
            await generate()
        }
    }

    // === 限时逻辑：完整封装于 useQuizCountdown（截止时刻计算/每秒 tick/超时通知） ===
    // 不可直接调 grade：其防重条件要求 submittedAt 非空，作答中超时会被直接拒绝，
    // 故 onTimeUp 内须先 submit（标记已提交）再 grade
    const { remainingText, isTimeUrgent } = useQuizCountdown({
        quiz,
        active: open && status === 'answering',
        onTimeUp: () => {
            void (async () => {
                const ok = await submit()
                if (ok) {
                    showSnackbar('测验时间到，已自动提交并批改', 'info')
                    await grade()
                }
            })()
        },
    })

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={lessonTopic ? `专属测验 · ${lessonTopic}` : '专属测验'}
            size="full"
            isScroll={true}
            onConfirm={confirmAction ? handleConfirm : undefined}
            confirmLabel={
                confirmAction ? CONFIRM_LABELS[confirmAction] : undefined
            }
            // 批改中确认按钮转圈并禁用，防止重复触发 AI 流程
            isLoading={status === 'grading'}
            isDisabled={status === 'grading' || status === 'generating'}>
            {!canQuiz ? (
                <LockedState />
            ) : (
                <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                        {isViewingHistory ? (
                            historyQuiz ? (
                                <QuizHistoryView quiz={historyQuiz} />
                            ) : (
                                <Loading />
                            )
                        ) : sidePanel.panel === 'wrong' ? (
                            <WrongBookView
                                wrongQuestions={wrongQuestions}
                                isLoading={isWrongLoading}
                            />
                        ) : isEmpty ? (
                            <EmptyState
                                isGenerating={status === 'generating'}
                                errorMsg={status === 'error' ? errorMsg : null}
                                onGenerate={() => void generate()}
                            />
                        ) : (
                            <QuizBody
                                status={status}
                                quiz={quiz}
                                answers={answers}
                                errorMsg={errorMsg}
                                isSubmitted={isSubmitted}
                                setAnswer={setAnswer}
                            />
                        )}
                    </div>
                    <QuizSidePanel
                        panel={sidePanel.panel}
                        history={history}
                        selectedQuizId={sidePanel.selectedQuizId}
                        isHistoryLoading={isHistoryLoading}
                        remainingText={remainingText}
                        isTimeUrgent={isTimeUrgent}
                        onTogglePanel={(panel) =>
                            dispatchSidePanel({ type: 'TOGGLE_PANEL', panel })
                        }
                        onSelectHistory={(quizId) =>
                            dispatchSidePanel({
                                type: 'SELECT_HISTORY',
                                quizId,
                            })
                        }
                        onShowQuiz={() => dispatchSidePanel({ type: 'RESET' })}
                    />
                </div>
            )}
        </Modal>
    )
}

function QuizBody({
    status,
    quiz,
    answers,
    errorMsg,
    isSubmitted,
    setAnswer,
}: {
    status: QuizStatus
    quiz: StudynotesQuiz | null
    answers: string[]
    errorMsg: string | null
    isSubmitted: boolean
    setAnswer: (index: number, value: string) => void
}) {
    const results = quiz?.results ?? null
    const hasResults = results !== null
    // 预构建 index -> result 映射，避免题目列表内 O(n²) 查找
    const resultMap = useMemo(() => {
        const map = new Map<number, StudynotesQuizResult>()
        if (results) {
            for (const r of results) {
                map.set(r.index, r)
            }
        }
        return map
    }, [results])

    // 仅「已有批改结果」或「批改进行中」展示只读答案区；
    // 已提交未批改时保持可作答/可查看，批改后才切换为只读结果视图
    const isReadOnly = hasResults || status === 'grading'

    // 作答 textarea 自适应高度：内容或状态变化后按 scrollHeight 调整，避免固定行数浪费空间/内部滚动
    const answerListRef = useRef<HTMLDivElement>(null)
    useLayoutEffect(() => {
        const container = answerListRef.current
        if (!container) return
        const textareas =
            container.querySelectorAll<HTMLTextAreaElement>('.form-textarea')
        textareas.forEach((el) => {
            el.style.height = '1px'
            // scrollHeight 不含边框，border-box 下需补上边框高度
            el.style.height = `${el.scrollHeight + 2}px`
        })
    }, [quiz, answers, status])

    return (
        <div className="flex flex-1 flex-col">
            <QuizHeader
                isSubmitted={isSubmitted}
                hasResults={hasResults}
                quiz={quiz}
            />

            <ResultFeedback
                isSubmitted={isSubmitted}
                hasResults={hasResults}
                quiz={quiz}
                status={status}
                errorMsg={errorMsg}
            />

            {/* 题目列表（纵向滚动） */}
            <div
                ref={answerListRef}
                className="flex-1 space-y-4 overflow-y-auto p-4">
                {quiz?.questions.map((q) => {
                    const result = resultMap.get(q.index) ?? null
                    // answers 为 0-based 数组，q.index 为 1-based 题号，取 -1 对齐
                    const answer = answers[q.index - 1] ?? ''
                    return (
                        <QuizQuestionItem
                            key={q.index}
                            question={q}
                            result={result}
                            answer={answer}
                            isReadOnly={isReadOnly}
                            onAnswerChange={setAnswer}
                        />
                    )
                })}
            </div>
        </div>
    )
}

function LockedState() {
    return (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
            AI 评估未达 80 分，暂不能开始测验。请先完善学习心得并重新评估。
        </div>
    )
}

function EmptyState({
    isGenerating,
    errorMsg,
    onGenerate,
}: {
    isGenerating: boolean
    errorMsg: string | null
    onGenerate: () => void
}) {
    // 生成中隐藏按钮仅显示 loading，避免 AI 出题期间重复触发；失败时展示错误并允许重试
    if (isGenerating) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-sm text-gray-600">正在生成题目…</p>
            </div>
        )
    }
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            {errorMsg && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                    {errorMsg}
                </p>
            )}
            <p className="text-sm text-gray-600">还没有进行专属测验。</p>
            <button
                type="button"
                onClick={onGenerate}
                className="btn btn-primary">
                <RefreshCw className="size-4" />
                开始测验
            </button>
        </div>
    )
}

/** 左侧错题本视图：宽版展示该课程全部错题，复用 WrongQuestionCard（默认不带来源课程） */
function WrongBookView({
    wrongQuestions,
    isLoading,
}: {
    wrongQuestions: WrongQuestion[]
    isLoading: boolean
}) {
    return (
        <div className="flex flex-1 flex-col">
            <div className="border-b border-gray-200 bg-white px-4 pb-3">
                <div className="text-sm font-semibold text-gray-800">
                    错题本
                </div>
                <div className="text-xs text-gray-500">
                    {isLoading ? (
                        <Loading />
                    ) : (
                        `共 ${wrongQuestions.length} 道错题（按最近一次答错去重）`
                    )}
                </div>
            </div>
            {isLoading ? (
                <Loading />
            ) : wrongQuestions.length === 0 ? (
                <div className="flex h-full items-center justify-center p-6 text-sm text-gray-500">
                    太棒了，当前没有错题！
                </div>
            ) : (
                // 不设内部滚动容器：随 Modal 外层滚动条统一滚动
                <div className="space-y-4 p-4">
                    {wrongQuestions.map((item, index) => (
                        <WrongQuestionCard
                            key={`${item.submittedAt}-${index}`}
                            item={item}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

/** 历史测验只读回看视图：展示该次测验的完整题目、作答与批改结果，禁止交互作答 */
function QuizHistoryView({ quiz }: { quiz: StudynotesQuiz }) {
    // 预构建 index -> result 映射，避免题目列表内 O(n²) 查找
    const resultMap = useMemo(() => {
        const map = new Map<number, StudynotesQuizResult>()
        if (quiz.results) {
            for (const r of quiz.results) {
                map.set(r.index, r)
            }
        }
        return map
    }, [quiz.results])

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 pb-3">
                <div className="min-w-0 space-y-1">
                    <div className="truncate text-sm font-semibold text-gray-800">
                        历史测验 ·{' '}
                        {formatDate(quiz.submittedAt ?? quiz.generatedAt)}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                        共 {quiz.questions.length} 题 · 满分 100 分（只读回看）
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm">
                    <span className="text-gray-600">
                        答对{' '}
                        <strong className="text-green-600">
                            {quiz.correctCount ?? 0}
                        </strong>{' '}
                        / {quiz.questions.length}
                    </span>
                    <ScoreBadge score={quiz.score} />
                </div>
            </div>

            {quiz.comment && (
                <div className="border-b border-gray-200 bg-white p-3 text-sm">
                    <div className="border-l-2 border-blue-300 bg-blue-50/60 p-3 leading-relaxed text-gray-700">
                        <MarkdownView
                            content={quiz.comment}
                            className="bg-transparent!"
                        />
                    </div>
                </div>
            )}

            <div className="flex-1 space-y-4 p-4">
                {quiz.questions.map((q) => {
                    const result = resultMap.get(q.index) ?? null
                    const answer = quiz.answers?.[q.index - 1] ?? ''
                    return (
                        <QuizQuestionItem
                            key={q.index}
                            question={q}
                            result={result}
                            answer={answer}
                            isReadOnly={true}
                            onAnswerChange={() => undefined}
                        />
                    )
                })}
            </div>
        </div>
    )
}

function QuizHeader({
    isSubmitted,
    hasResults,
    quiz,
}: {
    isSubmitted: boolean
    hasResults: boolean
    quiz: StudynotesQuiz | null
}) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 pb-3">
            <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-semibold text-gray-800">
                    {isSubmitted && hasResults ? '测验结果' : '专属测验'}
                </div>
                <div className="truncate text-xs text-gray-500">
                    {isSubmitted && hasResults
                        ? `共 ${quiz?.questions.length ?? 20} 题 · 满分 100 分`
                        : `共 ${quiz?.questions.length ?? 20} 题 · 满分 100 分待作答`}
                </div>
            </div>
            {/* 已批改结果摘要；批改/重新测验动作由底部确认栏按状态承载 */}
            <div className="flex shrink-0 items-center gap-2.5">
                {isSubmitted && quiz && hasResults && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">
                            答对{' '}
                            <strong className="text-green-600">
                                {quiz.correctCount}
                            </strong>{' '}
                            / {quiz?.questions.length ?? 20}
                        </span>
                        <span className="h-4 w-px bg-gray-300" />
                        <ScoreBadge score={quiz.score} />
                    </div>
                )}
            </div>
        </div>
    )
}

function ResultFeedback({
    isSubmitted,
    hasResults,
    quiz,
    status,
    errorMsg,
}: {
    isSubmitted: boolean
    hasResults: boolean
    quiz: StudynotesQuiz | null
    status: QuizStatus
    errorMsg: string | null
}) {
    const showBlock =
        (isSubmitted && quiz && hasResults) || (status === 'error' && errorMsg)
    if (!showBlock) {
        return null
    }
    return (
        <div className="space-y-3 border-b border-gray-200 bg-white p-3 text-sm">
            {status === 'error' && errorMsg && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                    <span className="text-xs text-red-600">{errorMsg}</span>
                </div>
            )}
            {isSubmitted && quiz && hasResults && (
                <div className="space-y-3">
                    {quiz.comment && (
                        <div className="border-l-2 border-blue-300 bg-blue-50/60 p-3 leading-relaxed text-gray-700">
                            <MarkdownView
                                content={quiz.comment ?? ''}
                                className="bg-transparent!"
                            />
                        </div>
                    )}
                    <ReviewSuggestions suggestions={quiz.suggestions} />
                </div>
            )}
        </div>
    )
}

function ReviewSuggestions({ suggestions }: { suggestions: string[] }) {
    if (suggestions.length === 0) {
        return null
    }
    return (
        <div className="text-sm">
            <div className="mb-1.5 font-semibold text-amber-900">复习建议</div>
            <ul className="space-y-1 text-amber-800">
                {suggestions.map((s, i) => (
                    <li
                        key={i}
                        className="list-disc ml-5 marker:text-amber-700">
                        {s}
                    </li>
                ))}
            </ul>
        </div>
    )
}

/** 题目类型：旧数据无 type 时按简答兼容 */
function getQuestionType(
    q: StudynotesQuizQuestion,
): StudynotesQuizQuestionType {
    return q.type ?? 'essay'
}

function QuizQuestionItem({
    question,
    result,
    answer,
    isReadOnly,
    onAnswerChange,
}: {
    question: StudynotesQuizQuestion
    result: StudynotesQuizResult | null
    answer: string
    isReadOnly: boolean
    onAnswerChange: (index: number, value: string) => void
}) {
    const type = getQuestionType(question)
    const points = question.points ?? 10
    return (
        <div className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-primary">
                    {question.index}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                            {STUDYNODES_QUIZ_TYPE_LABELS[type]}
                        </span>
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                            本题 {formatScore(points)} 分
                        </span>
                    </div>
                    <MarkdownView
                        content={question.question}
                        className="bg-transparent!"
                    />
                </div>
            </div>

            {type === 'single' || type === 'multi' ? (
                <ObjectiveAnswer
                    question={question}
                    result={result}
                    answer={answer}
                    isReadOnly={isReadOnly}
                    onAnswerChange={onAnswerChange}
                />
            ) : (
                <EssayAnswer
                    question={question}
                    result={result}
                    answer={answer}
                    isReadOnly={isReadOnly}
                    onAnswerChange={onAnswerChange}
                />
            )}
        </div>
    )
}

/** 客观题选项配色：可作答一律普通；只读态选对绿 / 选错红 / 漏选正确项蓝描边 / 其余普通 */
function getOptionTone(
    isReadOnly: boolean,
    isSelected: boolean,
    isCorrectOpt: boolean,
): string {
    if (!isReadOnly) return 'border-gray-200 bg-white hover:bg-gray-50'
    if (isSelected && isCorrectOpt) return 'border-green-400 bg-green-50'
    if (isSelected) return 'border-red-400 bg-red-50'
    if (isCorrectOpt) return 'border-blue-300 bg-blue-50'
    return 'border-gray-200 bg-white'
}

/** 客观题（单选/多选）作答与只读结果视图 */
function ObjectiveAnswer({
    question,
    result,
    answer,
    isReadOnly,
    onAnswerChange,
}: {
    question: StudynotesQuizQuestion
    result: StudynotesQuizResult | null
    answer: string
    isReadOnly: boolean
    onAnswerChange: (index: number, value: string) => void
}) {
    const isMulti = question.type === 'multi'
    const selected = decodeMultiSelection(answer)
    // 批改结果中 correctAnswer 为标准答案（字母串，如 "B" / "A,C"），本地判分时已由服务端写入
    const correct = result ? decodeMultiSelection(result.correctAnswer) : []

    const handleToggle = (letter: string) => {
        if (isMulti) {
            const next = selected.includes(letter)
                ? selected.filter((s) => s !== letter)
                : [...selected, letter]
            onAnswerChange(question.index - 1, encodeMultiSelection(next))
        } else {
            // 单选：点击已选项则清空，否则选中该字母
            onAnswerChange(
                question.index - 1,
                selected[0] === letter ? '' : letter,
            )
        }
    }

    return (
        <div className="space-y-1.5 pl-8">
            {(question.options ?? []).map((opt, i) => {
                const letter = String.fromCharCode('A'.charCodeAt(0) + i)
                const isSelected = selected.includes(letter)
                const isCorrectOpt = correct.includes(letter)
                const optionTone = getOptionTone(
                    isReadOnly,
                    isSelected,
                    isCorrectOpt,
                )
                return (
                    <label
                        key={letter}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${optionTone} ${
                            isReadOnly ? 'cursor-default' : ''
                        }`}>
                        <input
                            type={isMulti ? 'checkbox' : 'radio'}
                            name={`quiz-option-${question.index}`}
                            disabled={isReadOnly}
                            checked={isSelected}
                            onChange={() => handleToggle(letter)}
                            className="mt-0.5 size-3.5 shrink-0 accent-blue-600"
                        />
                        <span className="text-gray-800">
                            <span className="font-medium">{letter}.</span>{' '}
                            {stripOptionPrefix(opt)}
                        </span>
                    </label>
                )
            })}

            {/* result 为 null（批改进行中）时不渲染结果区，避免误标红叉「答错」；
                仅锁定作答等待批改完成 */}
            {isReadOnly && result && (
                <div className="space-y-2 pt-1">
                    <p
                        className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-sm ${
                            !answer.trim() || !result?.isCorrect
                                ? 'bg-red-50 text-red-600'
                                : 'bg-green-50 text-green-700'
                        }`}>
                        {!answer.trim() || !result?.isCorrect ? (
                            <XCircle className="mt-0.5 size-4 shrink-0" />
                        ) : (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                        )}
                        <span>
                            <span>答：</span>
                            <span className="font-medium">
                                {formatAnswerText(
                                    question.options ?? [],
                                    answer,
                                )}
                            </span>
                            {result && (
                                <span className="shrink-0 font-semibold">
                                    （得 {formatScore(result.score)} / 满分{' '}
                                    {formatScore(question.points ?? 10)} 分）
                                </span>
                            )}
                        </span>
                    </p>
                    {result && (
                        <div className="space-y-2">
                            <div className="flex rounded-md bg-blue-50 p-2">
                                <span className="font-extrabold text-sm text-blue-800">
                                    参考答案：
                                </span>
                                {/* 客观题 correctAnswer 为字母串，与「答」行一致还原为可读选项文本 */}
                                <span className="text-sm! text-blue-800!">
                                    {formatAnswerText(
                                        question.options ?? [],
                                        result.correctAnswer,
                                    )}
                                </span>
                            </div>
                            {result.explanation && (
                                <div className="flex rounded-md bg-amber-50 p-2">
                                    <span className="font-extrabold text-sm text-amber-800">
                                        解析：
                                    </span>
                                    <MarkdownView
                                        content={result.explanation}
                                        className="text-sm! text-amber-800! bg-transparent!"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

/** 主观题（简答）作答与只读结果视图（沿用原 textarea 逻辑） */
function EssayAnswer({
    question,
    result,
    answer,
    isReadOnly,
    onAnswerChange,
}: {
    question: StudynotesQuizQuestion
    result: StudynotesQuizResult | null
    answer: string
    isReadOnly: boolean
    onAnswerChange: (index: number, value: string) => void
}) {
    // 空答案（空白/纯空格）一律按错误标记，避免 AI 误判为正确时出现绿勾红叉矛盾
    const isAnswerEmpty = !answer.trim()
    const answerTone = isAnswerEmpty
        ? 'bg-red-50 text-red-600'
        : !result
          ? 'text-gray-600'
          : result.isCorrect
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-600'
    return (
        <div className="space-y-2 pl-8">
            {isReadOnly ? (
                <>
                    <p
                        className={`flex items-start gap-1.5 rounded-md px-2 py-1.5 text-sm ${answerTone}`}>
                        {result &&
                            (isAnswerEmpty || !result.isCorrect ? (
                                <XCircle className="mt-0.5 size-4 shrink-0" />
                            ) : (
                                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                            ))}
                        <span>
                            <span>答：</span>
                            <span
                                className={
                                    result ? 'font-medium' : 'text-gray-800'
                                }>
                                {answer || '（未作答）'}
                            </span>
                            {result && (
                                <span className="shrink-0 font-semibold">
                                    （得 {formatScore(result.score)} / 满分{' '}
                                    {formatScore(question.points ?? 10)} 分）
                                </span>
                            )}
                        </span>
                    </p>
                    {result && (
                        <div className="space-y-2">
                            <div className="flex rounded-md bg-blue-50 p-2">
                                <span className="font-extrabold text-sm text-blue-800">
                                    参考答案：
                                </span>
                                <MarkdownView
                                    content={result.correctAnswer}
                                    className="text-sm! text-blue-800! bg-transparent!"
                                />
                            </div>
                            {result.explanation && (
                                <div className="flex rounded-md bg-amber-50 p-2">
                                    <span className="font-extrabold text-sm text-amber-800">
                                        解析：
                                    </span>
                                    <MarkdownView
                                        content={result.explanation}
                                        className="text-sm! text-amber-800! bg-transparent!"
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <textarea
                    value={answer}
                    onChange={(e) =>
                        onAnswerChange(question.index - 1, e.target.value)
                    }
                    placeholder="在此作答（可留空，留空判 0 分）"
                    rows={1}
                    maxLength={2000}
                    className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                />
            )}
        </div>
    )
}

function ScoreBadge({ score }: { score: number | null }) {
    const value = score ?? 0
    const colorClass =
        value < 80
            ? 'bg-red-50 text-red-700'
            : value < 90
              ? 'bg-green-50 text-green-700'
              : 'bg-amber-50 text-amber-700'
    return (
        <span className={`rounded-full px-3 py-1 font-semibold ${colorClass}`}>
            得分 {formatScore(value)}
        </span>
    )
}

// 分数格式化：整数显示整数，非整数保留一位小数（如 5.5 分）
function formatScore(score: number): string {
    const safe = Number.isFinite(score) ? score : 0
    return Number.isInteger(safe) ? String(safe) : safe.toFixed(1)
}
