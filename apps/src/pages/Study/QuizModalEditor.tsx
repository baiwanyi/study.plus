'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { MarkdownView } from '@components/MarkdownView'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { STUDYNODES_QUIZ_TYPE_LABELS } from '@shared/types'
import { decodeMultiSelection, encodeMultiSelection } from '@shared/utils'
import { useStudynotesQuiz } from './hooks/useStudynotesQuiz'
import type {
    StudynotesQuiz,
    StudynotesQuizQuestion,
    StudynotesQuizQuestionType,
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

    // 底部确认栏仅负责「提交答案」；批改按钮置于 QuizHeader。
    // 批改前（含已提交未批改）均显示，允许反复提交直到批改
    const showSubmitConfirm = Boolean(quiz) && quiz?.results == null
    const handleSubmit = async () => {
        const ok = await submit()
        if (ok) {
            showSnackbar('已提交，请点击「批改」查看结果', 'info')
        }
    }

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
            onConfirm={showSubmitConfirm ? handleSubmit : undefined}
            confirmLabel="提交答案"
            // 生成/批改中均禁用底部确认，避免 AI 流程中误提交旧答案
            isLoading={status === 'grading'}
            isDisabled={status === 'grading' || status === 'generating'}>
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
                    onGrade={() => void grade()}
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
    onGrade,
}: {
    status: QuizStatus
    quiz: StudynotesQuiz | null
    answers: string[]
    errorMsg: string | null
    isSubmitted: boolean
    setAnswer: (index: number, value: string) => void
    generate: () => Promise<void> | void
    onGrade: () => void
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
                status={status}
                onGenerate={() => void generate()}
                onGrade={onGrade}
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
    onGrade,
}: {
    isSubmitted: boolean
    hasResults: boolean
    quiz: StudynotesQuiz | null
    status: QuizStatus
    onGenerate: () => void
    onGrade: () => void
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
            <div className="flex shrink-0 items-center gap-2.5">
                {isSubmitted && quiz && (
                    <>
                        {hasResults ? (
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
                        ) : (
                            <button
                                type="button"
                                disabled={
                                    status === 'generating' ||
                                    status === 'grading'
                                }
                                onClick={onGrade}
                                className="btn btn-primary">
                                {status === 'grading' ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : null}
                                批改
                            </button>
                        )}
                        {/* 仅已批改后才允许重新测试：未批改（含已提交未批改）时重新生成会覆盖
                            已提交内容（generate 内部已拒绝），按钮此时不可见避免用户误点 */}
                        {hasResults && (
                            <button
                                type="button"
                                disabled={
                                    status === 'generating' ||
                                    status === 'grading'
                                }
                                onClick={onGenerate}
                                className="btn btn-outline">
                                重新测验
                            </button>
                        )}
                    </>
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
                            <MarkdownView content={quiz.comment ?? ''} />
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
                    <MarkdownView content={question.question} />
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
                const letter = String.fromCharCode(65 + i)
                const isSelected = selected.includes(letter)
                const isCorrectOpt = correct.includes(letter)
                // 只读态配色：选中且正确=绿，选中且错误=红，漏选正确=蓝描边，其余普通
                const optionTone = !isReadOnly
                    ? 'border-gray-200 bg-white hover:bg-gray-50'
                    : isSelected && isCorrectOpt
                      ? 'border-green-400 bg-green-50'
                      : isSelected
                        ? 'border-red-400 bg-red-50'
                        : isCorrectOpt
                          ? 'border-blue-300 bg-blue-50'
                          : 'border-gray-200 bg-white'
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

            {isReadOnly && (
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
                                {formatObjectiveAnswer(question, answer)}
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

// 剥离选项文本自带的字母序号前缀（AI 出题可能返回 "A. 选项" 这类带前缀文本，
// 前端渲染时已追加 {letter}. 前缀，不剥离会显示成 "A.A. 选项" 的重复序号）
function stripOptionPrefix(opt: string): string {
    return opt.replace(/^[A-Za-z]\.\s*/, '').trim()
}

// 只读态「答：」展示：把答案字母编码映射为可读选项文本（如 "A,C" -> "A. 选项1；C. 选项2"），
// 避免直接显示 "A,C" 与选项列表的字母序号语义重复
function formatObjectiveAnswer(
    question: StudynotesQuizQuestion,
    answer: string,
): string {
    const letters = decodeMultiSelection(answer)
    if (letters.length === 0) {
        return '（未作答）'
    }
    const options = question.options ?? []
    return letters
        .map((letter) => {
            const idx = letter.charCodeAt(0) - 65
            const text = options[idx]
            return text ? `${letter}. ${stripOptionPrefix(text)}` : letter
        })
        .join('；')
}
