'use client'

import { toPng } from 'html-to-image'
import { BookOpen, Sparkles } from 'lucide-react'
import { useRef, useCallback, type FC } from 'react'
import { Modal } from '@components/Modal'
import { feynmanSubjectLabels, formatDate } from '@shared/utils'
import type { FeynmanCard, FeynmanEvaluation } from '@shared/types'
import { EvaluationReport } from './EvaluationReport'

interface FeynmanModalShareProps {
    open: boolean
    card: FeynmanCard | null
    onCancel: () => void
}

const SUBJECT_COLORS: Record<string, string> = {
    math: 'bg-blue-100 text-blue-800',
    chinese: 'bg-red-100 text-red-800',
    english: 'bg-yellow-100 text-yellow-800',
}

function parseEvaluation(raw: string | null): FeynmanEvaluation | null {
    if (!raw) return null
    try {
        return JSON.parse(raw) as FeynmanEvaluation
    } catch {
        return null
    }
}

export const FeynmanModalShare: FC<FeynmanModalShareProps> = ({
    open,
    card,
    onCancel,
}) => {
    const contentRef = useRef<HTMLDivElement>(null)
    const evaluation = parseEvaluation(card?.evaluation ?? null)

    const handleDownload = useCallback(async () => {
        if (!contentRef.current) return
        try {
            const dataUrl = await toPng(contentRef.current, {
                pixelRatio: 2,
                backgroundColor: '#FFFFFF',
            })
            const safeTitle = (card?.topic || '心得').replace(
                /[/\\:*?"<>|]/g,
                '_',
            )
            const link = document.createElement('a')
            link.download = `学习心得_${safeTitle}.png`
            link.href = dataUrl
            link.click()
            link.remove()
        } catch (err) {
            console.error('导出图片失败:', err)
        }
    }, [card?.topic])

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title="分享"
            onConfirm={handleDownload}
            confirmLabel="下载图片"
            size="lg"
            isScroll>
            <div ref={contentRef} className="space-y-6">
                {/* Header */}
                <section className="card">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                        <BookOpen className="w-5 h-5 text-primary shrink-0" />
                        <h3 className="text-lg font-bold text-headline">
                            学习心得卡
                        </h3>
                    </div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            {card && (
                                <span
                                    className={`badge ${SUBJECT_COLORS[card.subject] || 'bg-gray-100 text-gray-800'}`}>
                                    {feynmanSubjectLabels[card.subject] ||
                                        card.subject}
                                </span>
                            )}
                            {card?.topic && (
                                <span className="text-sm font-medium text-gray-700">
                                    {card.topic}
                                </span>
                            )}
                        </div>
                        {card && (
                            <p className="text-xs text-gray-400">
                                {formatDate(card.createdAt).split(' ')[0]}
                            </p>
                        )}
                    </div>
                </section>

                {/* Q1 */}
                <section className="card">
                    <h4 className="text-sm font-bold text-gray-800 mb-2">
                        问题一：用一句话概括
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {card?.summary}
                    </p>
                </section>

                {/* Q2 */}
                <section className="card">
                    <h4 className="text-sm font-bold text-gray-800 mb-2">
                        问题二：自己的例子
                    </h4>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {card?.example}
                    </p>
                </section>

                {/* Q3 */}
                {card?.stuckPoints && (
                    <section className="card">
                        <h4 className="text-sm font-bold text-gray-800 mb-2">
                            问题三：卡壳点
                        </h4>
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {card.stuckPoints}
                        </p>
                    </section>
                )}

                {/* Memory Hook */}
                {card?.memoryHook && (
                    <section className="card bg-yellow-50! border-yellow-200!">
                        <h4 className="text-sm font-bold text-yellow-800 mb-2">
                            记忆钩子
                        </h4>
                        <p className="text-sm text-yellow-700 leading-relaxed">
                            {card.memoryHook}
                        </p>
                    </section>
                )}

                {/* AI Evaluation */}
                {evaluation && (
                    <section className="card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                            <Sparkles className="size-5 text-primary shrink-0" />
                            <h3 className="text-lg font-bold text-headline">
                                AI 评估结果
                            </h3>
                        </div>
                        <EvaluationReport evaluation={evaluation} />
                    </section>
                )}
            </div>
        </Modal>
    )
}
