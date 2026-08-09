'use client'

import { useMemo } from 'react'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { useStudynotesQuiz } from './hooks/useStudynotesQuiz'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizResult,
} from '@shared/types'
import type { FC } from 'react'

type QuizStatus =
    | 'idle'
    | 'generating'
    | 'answering'
    | 'grading'
    | 'graded'
    | 'error'

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
    } = useStudynotesQuiz(cardId, canQuiz, () => {
        showSnackbar('答题内容已自动保存', 'success')
    })

    // 仅「已提交且尚未批改」时，将批改动作放到弹窗底部确认栏
    const showGradeConfirm = isSubmitted && quiz?.results == null
    const handleGrade = () => void grade()

    const handleClose = () => {
        onSaved?.()
        onClose()
    }

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            title={lessonTopic ? `专属测验 · ${lessonTopic}` : '专属测验'}
            size="full"
            isScroll={true}
            footer={showGradeConfirm ? undefined : false}
            onConfirm={showGradeConfirm ? handleGrade : undefined}
            confirmLabel="批改"
            isLoading={status === 'grading'}
            isDisabled={status === 'grading'}>
            {!canQuiz ? (
                <LockedState />
            ) : isEmpty ? (
                <EmptyState
                    isGenerating={status === 'generating'}
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
                    generate={generate}
                    submit={submit}
                />
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
    generate,
    submit,
}: {
    status: QuizStatus
    quiz: StudynotesQuiz | null
    answers: string[]
    errorMsg: string | null
    isSubmitted: boolean
    setAnswer: (index: number, value: string) => void
    generate: () => Promise<void> | void
    submit: () => Promise<void> | void
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

    // 已提交或批改进行中均展示只读答案区，防止批改期间误改已提交内容
    const isReadOnly = isSubmitted || status === 'grading'

    return (
        <div className="flex flex-1 flex-col">
            <QuizHeader
                isSubmitted={isSubmitted}
                hasResults={hasResults}
                quiz={quiz}
                status={status}
                onGenerate={() => void generate()}
                onSubmit={() => void submit()}
            />

            <ResultFeedback
                isSubmitted={isSubmitted}
                hasResults={hasResults}
                quiz={quiz}
                status={status}
                errorMsg={errorMsg}
            />

            {/* 题目列表（纵向滚动） */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
    onGenerate,
}: {
    isGenerating: boolean
    onGenerate: () => void
}) {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-gray-600">还没有进行专属测验。</p>
            <button
                type="button"
                disabled={isGenerating}
                onClick={onGenerate}
                className="btn btn-primary">
                {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                ) : (
                    <RefreshCw className="size-4" />
                )}
                开始测验
            </button>
        </div>
    )
}

function QuizHeader({
    isSubmitted,
    hasResults,
    quiz,
    status,
    onGenerate,
    onSubmit,
}: {
    isSubmitted: boolean
    hasResults: boolean
    quiz: StudynotesQuiz | null
    status: QuizStatus
    onGenerate: () => void
    onSubmit: () => void
}) {
    return (
        <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 pb-3">
            <div className="min-w-0 space-y-1">
                <div className="truncate text-sm font-semibold text-gray-800">
                    {isSubmitted && hasResults ? '测验结果' : '专属测验'}
                </div>
                <div className="truncate text-xs text-gray-500">
                    {isSubmitted && hasResults
                        ? `共 ${quiz?.questions.length ?? 10} 题 · 已完成作答`
                        : `共 ${quiz?.questions.length ?? 10} 题待作答`}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
                {isSubmitted && quiz ? (
                    <>
                        {hasResults ? (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-600">
                                    答对{' '}
                                    <strong className="text-green-600">
                                        {quiz.correctCount}
                                    </strong>{' '}
                                    / {quiz?.questions.length ?? 10}
                                </span>
                                <span className="h-4 w-px bg-gray-300" />
                                <ScoreBadge score={quiz.score} />
                            </div>
                        ) : (
                            <span className="text-xs text-gray-500">
                                已提交，点击下方「批改」查看结果
                            </span>
                        )}
                        <button
                            type="button"
                            disabled={
                                status === 'generating' || status === 'grading'
                            }
                            onClick={onGenerate}
                            className="btn btn-outline">
                            重新测试
                        </button>
                    </>
                ) : (
                    <button
                        type="button"
                        disabled={status === 'grading'}
                        onClick={onSubmit}
                        className="btn btn-primary">
                        {status === 'grading' ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            '提交答案'
                        )}
                    </button>
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
                        <p className="border-l-2 border-blue-300 bg-blue-50/60 p-3 leading-relaxed text-gray-700">
                            {quiz.comment}
                        </p>
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
        <div className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex items-start gap-2">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-primary">
                    {question.index}
                </span>
                <p className="text-sm font-medium text-gray-800">
                    {question.question}
                </p>
            </div>

            {isReadOnly ? (
                <div className="space-y-2 pl-8">
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
                                    （{formatScore(result.score)}分）
                                </span>
                            )}
                        </span>
                    </p>
                    {result && (
                        <div className="space-y-2">
                            <p className="rounded-md bg-blue-50 p-2 text-sm text-blue-800">
                                参考答案：{result.correctAnswer}
                            </p>
                            {result.explanation && (
                                <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
                                    解析：{result.explanation}
                                </p>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <textarea
                    value={answer}
                    onChange={(e) =>
                        onAnswerChange(question.index - 1, e.target.value)
                    }
                    placeholder="在此作答（可留空，留空判 0 分）"
                    rows={2}
                    maxLength={2000}
                    className="form-textarea w-full min-h-14 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-y-auto"
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
            得分 {value}
        </span>
    )
}

// 题目得分格式化：整数显示整数，非整数保留一位小数（如 5.5 分）
function formatScore(score: number): string {
    const clamped = Math.min(10, Math.max(0, score))
    return Number.isInteger(clamped) ? String(clamped) : clamped.toFixed(1)
}
