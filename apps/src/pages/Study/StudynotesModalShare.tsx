'use client'
/**
 * 学习笔记分享弹窗组件：整合课前预习与课后心得为长图并导出 PNG。
 * 复用约定：数据由父组件注入（card），预习内容经 lessonsApi 拉取；评估/分析渲染复用
 * EvaluationReport 与 PreviewAnalysisReport；图片生成复用 html-to-image 的 toPng。
 * 关键约束：导出用容器不限制高度保证长图完整；学科主题色需覆盖全部枚举并带缺省回退；
 * toPng 返回 data URL（非 blob URL），无需 revokeObjectURL 回收。
 */
import { toPng } from 'html-to-image'
import { BookOpen, Sparkles } from 'lucide-react'
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react'
import { lessonsApi } from '@apps/services/lessons'
import { Modal } from '@components/Modal'
import { useSnackbar } from '@components/Snackbar'
import { formatDate } from '@shared/utils'
import type {
    StudynotesItem,
    StudynotesEvaluation,
    StudyPreview,
    StudyPreviewQuiz,
    PreviewAnalysis,
} from '@shared/types'
import { EvaluationReport } from './components/EvaluationReport'
import { PreviewAnalysisReport } from './components/PreviewAnalysisReport'
import { Loading } from '@apps/components/Loading'

interface StudynotesModalShareProps {
    open: boolean
    card: StudynotesItem | null
    onCancel: () => void
}

// 学科品牌色，覆盖全部枚举值，避免缺省回退为灰。
// soft：浅色头部底；accent：左侧竖色条；badge：徽章；label：中文名
const SUBJECT_THEME: Record<
    string,
    {
        soft: string
        accent: string
        badge: string
        label: string
    }
> = {
    math: {
        soft: 'bg-blue-50/60',
        accent: 'bg-blue-500',
        badge: 'bg-blue-100 text-blue-800',
        label: '数学',
    },
    chinese: {
        soft: 'bg-rose-50/60',
        accent: 'bg-rose-500',
        badge: 'bg-rose-100 text-rose-800',
        label: '语文',
    },
    english: {
        soft: 'bg-amber-50/60',
        accent: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-800',
        label: '英语',
    },
    science: {
        soft: 'bg-emerald-50/60',
        accent: 'bg-emerald-500',
        badge: 'bg-emerald-100 text-emerald-800',
        label: '科学',
    },
    custom: {
        soft: 'bg-slate-50/60',
        accent: 'bg-slate-500',
        badge: 'bg-slate-100 text-slate-700',
        label: '自定义',
    },
}

function getTheme(subject: string) {
    return SUBJECT_THEME[subject] || SUBJECT_THEME.custom
}

function parseJson<T>(raw: string | null): T | null {
    if (!raw) return null
    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

export const StudynotesModalShare: FC<StudynotesModalShareProps> = ({
    open,
    card,
    onCancel,
}) => {
    const exportRef = useRef<HTMLDivElement>(null)
    const { showSnackbar } = useSnackbar()

    const [preview, setPreview] = useState<StudyPreview | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)
    const [quiz, setQuiz] = useState<StudyPreviewQuiz | null>(null)
    const [quizLoading, setQuizLoading] = useState(false)
    const requestIdRef = useRef(0)

    const evaluation = useMemo(
        () => parseJson<StudynotesEvaluation>(card?.evaluation ?? null),
        [card?.evaluation],
    )
    const previewAnalysis = useMemo(
        () => parseJson<PreviewAnalysis>(preview?.aiAnalysis ?? null),
        [preview?.aiAnalysis],
    )

    useEffect(() => {
        if (!open) return
        const lessonId = card?.lessonId ?? null
        if (lessonId == null) {
            setPreview(null)
            setPreviewLoading(false)
            return
        }
        const myReq = ++requestIdRef.current
        let cancelled = false
        setPreviewLoading(true)
        setPreview(null)
        lessonsApi
            .getPreview(lessonId)
            .then(({ preview: data }) => {
                if (cancelled || myReq !== requestIdRef.current) return
                setPreview(data)
            })
            .catch(() => {
                if (cancelled || myReq !== requestIdRef.current) return
                showSnackbar('加载预习内容失败', 'error')
            })
            .finally(() => {
                if (cancelled || myReq !== requestIdRef.current) return
                setPreviewLoading(false)
            })

        // 课堂问答题与预习内容并行加载，二者独立，避免互相阻塞
        setQuizLoading(true)
        setQuiz(null)
        lessonsApi
            .getPreviewQuiz(lessonId)
            .then(({ quiz: q }) => {
                if (cancelled || myReq !== requestIdRef.current) return
                setQuiz(q)
            })
            .catch(() => {
                if (cancelled || myReq !== requestIdRef.current) return
            })
            .finally(() => {
                if (cancelled || myReq !== requestIdRef.current) return
                setQuizLoading(false)
            })

        // 组件卸载或依赖变化（含关闭弹窗）时标记取消，避免关闭后弹 toast
        return () => {
            cancelled = true
        }
    }, [open, card, showSnackbar])

    const handleDownload = useCallback(async () => {
        if (!exportRef.current) return
        if (previewLoading) {
            showSnackbar('预习内容加载中，请稍候再导出', 'info')
            return
        }
        try {
            const dataUrl = await toPng(exportRef.current, {
                pixelRatio: 2,
                backgroundColor: '#f8fafc',
            })
            const safeTitle = (card?.topic || '学习笔记').replace(
                /[/\\:*?"<>|]/g,
                '_',
            )
            const link = document.createElement('a')
            link.download = `学习笔记_${safeTitle}.png`
            link.href = dataUrl
            link.click()
            // toPng 返回 data URL（非 blob URL），revokeObjectURL 对其无效，交由 GC 回收
            showSnackbar('图片已生成', 'success')
        } catch (err) {
            console.error('导出图片失败:', err)
            showSnackbar('导出图片失败', 'error')
        }
    }, [card?.topic, previewLoading, showSnackbar])

    const subject = card?.subject ?? 'custom'
    const theme = getTheme(subject)
    const createdDate = card ? formatDate(card.createdAt).split(' ')[0] : ''

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title="分享"
            onConfirm={handleDownload}
            confirmLabel="下载图片"
            size="lg"
            isScroll>
            <div className="space-y-6">
                {/* 导出用完整长图容器：不限制高度，确保截图内容完整 */}
                <div
                    ref={exportRef}
                    className="bg-linear-to-b from-slate-50 to-white overflow-hidden">
                    {/* 学科头部：浅底 + 左侧竖色条，与下方白卡片自然衔接 */}
                    <div
                        className={`flex gap-4 ${theme.soft} px-6 py-5 border-l-4 ${theme.accent}`}>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-gray-500">
                                    <BookOpen className="w-4 h-4" />
                                    <span className="text-xs font-medium">
                                        学习笔记
                                    </span>
                                </div>
                                <span className="text-xs text-gray-400">
                                    {createdDate}
                                </span>
                            </div>
                            {/* 头部底色为 theme.soft 浅色系，标题须用深色保证对比度 */}
                            <h2 className="text-xl font-bold text-gray-900 mt-2 leading-snug truncate">
                                {card?.topic || '未命名主题'}
                            </h2>
                            <div className="mt-3 flex items-center gap-2">
                                <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${theme.badge}`}>
                                    {theme.label}
                                </span>
                                <span className="text-xs text-gray-400">
                                    课前预习 · 课后心得
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-5 space-y-5">
                        {/* ===== 课前预习 ===== */}
                        <section className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                <span className="flex size-7 items-center justify-center rounded-full bg-indigo-500 text-xs font-bold text-white">
                                    1
                                </span>
                                <h3 className="text-base font-bold text-headline">
                                    课前预习
                                </h3>
                            </div>

                            {previewLoading ? (
                                <Loading />
                            ) : preview ? (
                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                            预习笔记
                                        </h4>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                            {preview.content}
                                        </p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                            联系旧知
                                        </h4>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                            {preview.oldKnowledge}
                                        </p>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                            我的疑问
                                        </h4>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                            {preview.questions}
                                        </p>
                                    </div>

                                    {previewAnalysis && (
                                        <div className="rounded-xl bg-slate-50 p-4 mt-2">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Sparkles className="size-4 text-indigo-500" />
                                                <h5 className="text-sm font-bold text-indigo-700">
                                                    AI 预习分析
                                                </h5>
                                            </div>
                                            <PreviewAnalysisReport
                                                analysis={previewAnalysis}
                                            />
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400">
                                    未填写预习内容
                                </p>
                            )}
                        </section>

                        {/* ===== 课堂问答题 ===== */}
                        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                <span className="flex size-7 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
                                    2
                                </span>
                                <h3 className="text-base font-bold text-headline">
                                    课堂问答题
                                </h3>
                            </div>
                            {quizLoading ? (
                                <Loading />
                            ) : quiz ? (
                                quiz.results ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">
                                                本组问答题评分
                                            </span>
                                            <span className="text-base font-bold text-sky-700">
                                                {quiz.score} 分
                                            </span>
                                        </div>
                                        {quiz.questions.map((q) => {
                                            const result =
                                                quiz.results?.find(
                                                    (r) => r.index === q.index,
                                                ) ?? null
                                            return (
                                                <div
                                                    key={q.index}
                                                    className="rounded-lg bg-slate-50 p-3">
                                                    <h4 className="text-sm font-semibold text-gray-700">
                                                        {q.index}. {q.question}
                                                    </h4>
                                                    {result ? (
                                                        <>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                你的作答：
                                                                {result.studentAnswer ||
                                                                    '（未作答）'}
                                                            </p>
                                                            <p className="text-xs text-gray-600 mt-1">
                                                                参考答案：
                                                                {result.correctAnswer}
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                {result.explanation}
                                                            </p>
                                                            <p className="text-xs font-semibold mt-1 text-sky-600">
                                                                得分：{result.score}
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-xs text-gray-400 mt-1">
                                                            （待作答）
                                                        </p>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {quiz.questions.map((q) => (
                                            <p
                                                key={q.index}
                                                className="text-sm text-gray-600">
                                                {q.index}. {q.question}
                                            </p>
                                        ))}
                                        <p className="text-xs text-gray-400">
                                            （待作答）
                                        </p>
                                    </div>
                                )
                            ) : (
                                <p className="text-sm text-gray-400">
                                    未生成课堂问答题
                                </p>
                            )}
                        </section>

                        {/* ===== 课后心得 ===== */}
                        <section className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
                            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                                <span className="flex size-7 items-center justify-center rounded-full bg-rose-500 text-xs font-bold text-white">
                                    3
                                </span>
                                <h3 className="text-base font-bold text-headline">
                                    课后心得
                                </h3>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                        一句话概括
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                        {card?.summary}
                                    </p>
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                        自己的例子
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                        {card?.example}
                                    </p>
                                </div>
                                {card?.stuckPoints && (
                                    <div>
                                        <h4 className="text-sm font-semibold text-gray-700 mb-1">
                                            卡壳点
                                        </h4>
                                        <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                            {card.stuckPoints}
                                        </p>
                                    </div>
                                )}
                                {card?.memoryHook && (
                                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                                        <h4 className="text-sm font-semibold text-amber-800 mb-1">
                                            记忆钩子
                                        </h4>
                                        <p className="text-sm text-amber-700 leading-relaxed">
                                            {card.memoryHook}
                                        </p>
                                    </div>
                                )}

                                {evaluation && (
                                    <div className="rounded-xl bg-slate-50 p-4 mt-2">
                                        <div className="flex items-center gap-2 mb-3">
                                            <Sparkles className="size-4 text-rose-500" />
                                            <h5 className="text-sm font-bold text-rose-700">
                                                AI 评估结果
                                            </h5>
                                        </div>
                                        <EvaluationReport
                                            evaluation={evaluation}
                                        />
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </Modal>
    )
}
