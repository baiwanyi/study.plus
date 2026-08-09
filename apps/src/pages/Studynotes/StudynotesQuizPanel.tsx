'use client'

import { CheckCircle2, Loader2, RefreshCw, Send, XCircle } from 'lucide-react'
import { useStudynotesQuiz } from './hooks/useStudynotesQuiz'
import type { StudynotesQuizResult } from '@shared/types'

interface StudynotesQuizPanelProps {
    cardId: number | null
    canQuiz: boolean
}

export const StudynotesQuizPanel: React.FC<StudynotesQuizPanelProps> = ({
    cardId,
    canQuiz,
}) => {
    const {
        status,
        quiz,
        answers,
        errorMsg,
        isEmpty,
        isSubmitted,
        setAnswer,
        generate,
        submit,
    } = useStudynotesQuiz(cardId, canQuiz)

    if (!canQuiz) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-gray-500">
                AI 评估未达 80 分，暂不能开始测验。请先完善学习心得并重新评估。
            </div>
        )
    }

    if (isEmpty) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
                <p className="text-sm text-gray-600">还没有进行专属测验。</p>
                <button
                    type="button"
                    disabled={status === 'generating'}
                    onClick={() => void generate()}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                    {status === 'generating' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                    开始测验
                </button>
            </div>
        )
    }

    const results = quiz?.results ?? null

    return (
        <div className="flex h-full flex-col">
            {/* 顶部状态栏 */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="text-sm font-medium text-gray-700">
                    {isSubmitted ? '测验结果' : '专属测验（共 10 题）'}
                </div>
                {isSubmitted && quiz ? (
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-600">
                            答对 <strong className="text-green-600">{quiz.correctCount}</strong> / 10
                        </span>
                        <span className="rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                            得分 {quiz.score}
                        </span>
                    </div>
                ) : (
                    <button
                        type="button"
                        disabled={status === 'generating'}
                        onClick={() => void generate()}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-60"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                        重新测验
                    </button>
                )}
            </div>

            {/* 错题/成绩反馈（批改后） */}
            {isSubmitted && quiz && (
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    {quiz.comment && <p className="mb-2">{quiz.comment}</p>}
                    {quiz.suggestions.length > 0 && (
                        <div>
                            <span className="font-medium">复习建议：</span>
                            <ul className="ml-5 list-disc">
                                {quiz.suggestions.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* 题目列表（纵向滚动） */}
            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {quiz?.questions.map((q, i) => {
                    const result: StudynotesQuizResult | null = results
                        ? results.find((r) => r.index === q.index) ?? null
                        : null
                    return (
                        <div
                            key={q.index}
                            className="rounded-lg border border-gray-200 p-3"
                        >
                            <div className="mb-2 flex items-start gap-2">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                                    {q.index}
                                </span>
                                <p className="text-sm font-medium text-gray-800">
                                    {q.question}
                                </p>
                            </div>

                            {isSubmitted ? (
                                <div className="space-y-1 pl-8">
                                    <p className="text-sm text-gray-600">
                                        你的答案：
                                        <span className="text-gray-800">
                                            {answers[i] || '（空）'}
                                        </span>
                                    </p>
                                    {result && (
                                        <>
                                            <div className="flex items-center gap-1.5 text-sm">
                                                {result.isCorrect ? (
                                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <XCircle className="h-4 w-4 text-red-500" />
                                                )}
                                                <span className={result.isCorrect ? 'text-green-600' : 'text-red-500'}>
                                                    {result.isCorrect ? '正确' : '错误'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-gray-600">
                                                参考答案：{result.correctAnswer}
                                            </p>
                                            {result.explanation && (
                                                <p className="text-xs text-gray-500">
                                                    解析：{result.explanation}
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                <textarea
                                    value={answers[i] ?? ''}
                                    onChange={(e) => setAnswer(i, e.target.value)}
                                    placeholder="在此作答（可留空，留空判 0 分）"
                                    rows={2}
                                    className="mt-1 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                                />
                            )}
                        </div>
                    )
                })}
            </div>

            {/* 底部操作栏 */}
            {!isSubmitted && (
                <div className="border-t border-gray-200 px-4 py-3">
                    <button
                        type="button"
                        disabled={status === 'grading'}
                        onClick={() => void submit()}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {status === 'grading' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                        提交答案
                    </button>
                    <p className="mt-2 text-center text-xs text-gray-400">
                        答题内容每 30 秒自动保存
                    </p>
                </div>
            )}

            {status === 'error' && errorMsg && (
                <div className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">
                    {errorMsg}
                </div>
            )}
        </div>
    )
}
