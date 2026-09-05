'use client'
/**
 * 课前预习课堂问答题面板：渲染于预习弹窗右面板、AI 分析报告下方。
 * 复用约定：状态管理复用 useStudynotesPreviewQuiz；三态切换（生成→作答→评分）。
 * 关键约束：面板常驻渲染，未达标（<80）时仅展示达标要求提示、不提供生成入口；达标后生成与提交均调用 AI 并受服务端限流；
 * 评分结果一次性展示，不可重复提交。
 */
import { useEffect, useState, type FC } from 'react'
import { Lightbulb } from 'lucide-react'
import { useStudynotesPreviewQuiz } from '../hooks/useStudynotesPreviewQuiz'
import { Loading } from '@apps/components/Loading'

/** 生成课堂问答题所需的最低预习完整度分数 */
const QUIZ_MIN_COMPLETENESS = 80

interface PreviewQuizPanelProps {
    lessonId: number
    /** 当前预习完整度评分，用于判断是否达到生成课堂问答题的门槛 */
    completenessScore: number
}

export const PreviewQuizPanel: FC<PreviewQuizPanelProps> = ({
    lessonId,
    completenessScore,
}) => {
    const {
        status,
        quiz,
        errorMsg,
        isGenerating,
        isGrading,
        load,
        generate,
        submit,
    } = useStudynotesPreviewQuiz()
    const [answers, setAnswers] = useState<string[]>(['', '', ''])

    useEffect(() => {
        if (lessonId == null || completenessScore < QUIZ_MIN_COMPLETENESS) return
        load(lessonId)
    }, [lessonId, completenessScore, load])

    // 题目加载后初始化作答输入框，保证与题目数量一致
    useEffect(() => {
        if (quiz?.questions) {
            setAnswers(quiz.questions.map(() => ''))
        }
    }, [quiz?.id, quiz?.questions])

    const handleAnswerChange = (index: number, value: string) => {
        const next = [...answers]
        next[index] = value
        setAnswers(next)
    }

    const handleSubmit = async () => {
        await submit(
            lessonId,
            answers.map((a) => a.trim()),
        )
    }

    // 未达标：仅展示达标要求提示，不提供生成/作答入口
    if (completenessScore < QUIZ_MIN_COMPLETENESS) {
        return (
            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="size-4 text-amber-500" />
                    <h4 className="text-sm font-bold text-amber-700">课堂问答题</h4>
                </div>
                <p className="text-xs text-amber-700">
                    预习完整度需达到 {QUIZ_MIN_COMPLETENESS} 分才能生成课堂问答题，当前
                    {' '}
                    {completenessScore} 分。继续完善预习内容后重新分析即可解锁。
                </p>
            </div>
        )
    }

    if (status === 'loading') {
        return <Loading />
    }

    if (status === 'error') {
        return (
            <div className="mt-5 rounded-xl border border-indigo-100 bg-slate-50 p-4">
                <p className="text-xs text-red-600">{errorMsg ?? '操作失败'}</p>
                <button
                    onClick={() => (quiz ? load(lessonId) : generate(lessonId))}
                    className="btn btn-outline btn-sm mt-2">
                    重试
                </button>
            </div>
        )
    }

    // 未生成：展示生成入口（generating 时按钮禁用并提示中）
    if (!quiz) {
        return (
            <div className="mt-5 rounded-xl border border-indigo-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="size-4 text-indigo-500" />
                    <h4 className="text-sm font-bold text-indigo-700">课堂问答题</h4>
                </div>
                <p className="text-xs text-gray-600 mb-3">
                    预习完整度达标，可生成 3 道课堂上需弄清的问答题。课后根据课堂所学作答即可评分。
                </p>
                <button
                    onClick={() => generate(lessonId)}
                    disabled={isGenerating}
                    className="btn btn-primary">
                    {isGenerating ? '生成中...' : '生成课堂问答题'}
                </button>
            </div>
        )
    }

    // 已评分：展示结果与每题解析
    if (quiz.results) {
        return (
            <div className="mt-5 rounded-xl border border-indigo-100 bg-slate-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="size-4 text-indigo-500" />
                    <h4 className="text-sm font-bold text-indigo-700">课堂问答题</h4>
                </div>
                <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-gray-600">本组问答题评分</span>
                    <span className="text-base font-bold text-indigo-700">
                        {quiz.score} 分
                    </span>
                </div>
                <div className="space-y-3">
                    {quiz.results.map((r) => (
                        <div
                            key={r.index}
                            className="rounded-lg bg-white border border-gray-200 p-3">
                            <p className="text-xs font-semibold text-gray-700">
                                第 {r.index} 题：{r.question}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                你的作答：{r.studentAnswer || '（未作答）'}
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                                参考答案：{r.correctAnswer}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                {r.explanation}
                            </p>
                            <p className="text-xs font-semibold mt-1 text-indigo-600">
                                得分：{r.score}
                            </p>
                        </div>
                    ))}
                </div>
                {quiz.comment && (
                    <p className="text-xs text-gray-600 mt-3">{quiz.comment}</p>
                )}
            </div>
        )
    }

    // 已生成未评分：作答表单（grading 时禁用提交并提示中）
    return (
        <div className="mt-5 rounded-xl border border-indigo-100 bg-slate-50 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Lightbulb className="size-4 text-indigo-500" />
                <h4 className="text-sm font-bold text-indigo-700">课堂问答题</h4>
                <span className="text-xs text-gray-600">课后根据课堂所学作答</span>
            </div>
            <div className="space-y-3">
                {quiz.questions.map((q, i) => (
                    <div key={q.index}>
                        <label className="text-sm font-bold text-gray-800 mb-2 block">
                            第 {q.index} 题：{q.question}
                        </label>
                        <textarea
                            value={answers[i] ?? ''}
                            onChange={(e) => handleAnswerChange(i, e.target.value)}
                            rows={1}
                            placeholder="课后根据课堂所学作答"
                            className="form-textarea w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-hidden"
                        />
                    </div>
                ))}
                <button
                    onClick={handleSubmit}
                    disabled={isGrading || answers.some((a) => !a.trim())}
                    className="btn btn-primary">
                    {isGrading ? '评分中...' : '提交并评分'}
                </button>
            </div>
        </div>
    )
}
