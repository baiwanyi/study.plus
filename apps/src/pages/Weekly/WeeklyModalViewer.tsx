import { useRef, useCallback } from 'react'
import MDEditor from '@uiw/react-md-editor'
import { BookOpen, Target, Wrench, Sparkles, Share2 } from 'lucide-react'
import { toPng } from 'html-to-image'
import Modal from '@components/Modal'
import { parseContent } from '@shared/weekly'
import type { WeeklyAnalysis, WeeklyReport } from '@shared/types'
import '@apps/styles/markdown-viewer.css'

export interface WeeklyModalViewerProps {
    report: WeeklyReport | null
    onCancel: () => void
}

export default function WeeklyModalViewer({
    report,
    onCancel,
}: WeeklyModalViewerProps) {
    const contentRef = useRef<HTMLDivElement>(null)

    const handleShare = useCallback(async () => {
        if (!contentRef.current) return
        const dataUrl = await toPng(contentRef.current, {
            pixelRatio: 2,
            backgroundColor: '#ffffff',
        })
        const link = document.createElement('a')
        link.download = `周报_${report?.year}_第${report?.weekNumber}周.png`
        link.href = dataUrl
        link.click()
    }, [report])

    return (
        <Modal
            open={report !== null}
            onCancel={onCancel}
            title={
                report
                    ? `第${report.weekNumber}周学习周报（${report.year}年）`
                    : ''
            }
            footer={true}
            onConfirm={handleShare}
            confirmLabel="分享周报"
            confirmIcon={<Share2 className="w-4 h-4" />}
            size="lg"
            isScroll>
            {report &&
                (() => {
                    const content = parseContent(report.content)
                    const analysisData: WeeklyAnalysis | null = report.analysis
                        ? typeof report.analysis === 'string'
                            ? (JSON.parse(report.analysis) as WeeklyAnalysis)
                            : report.analysis
                        : null

                    return (
                        <div
                            ref={contentRef}
                            className="space-y-8"
                            data-color-mode="light">
                            <Section title="本周学习总结" icon={BookOpen}>
                                <ViewField
                                    label="学到的东西"
                                    value={content.learned}
                                />
                                <ViewField
                                    label="遇到的困难"
                                    value={content.difficulties}
                                />
                                <ViewField
                                    label="没有掌握的知识点"
                                    value={content.weakPoints}
                                />
                                <ViewField
                                    label="最有成就感的事"
                                    value={content.achievement}
                                />
                                <ViewField
                                    label="上周目标达成情况"
                                    value={content.lastWeekGoalReview}
                                />
                            </Section>

                            <Section
                                title="下周规划 — SMART 目标"
                                icon={Target}>
                                <ViewField
                                    label="S — 具体的"
                                    value={content.smartGoalS}
                                />
                                <ViewField
                                    label="M — 可衡量的"
                                    value={content.smartGoalM}
                                />
                                <ViewField
                                    label="A — 可实现的"
                                    value={content.smartGoalA}
                                />
                                <ViewField
                                    label="R — 相关的"
                                    value={content.smartGoalR}
                                />
                                <ViewField
                                    label="T — 有时限的"
                                    value={content.smartGoalT}
                                />
                            </Section>

                            <Section title="改进方法" icon={Wrench}>
                                <ViewField value={content.improvement} />
                            </Section>

                            {analysisData && (
                                <Section
                                    title="AI 分析"
                                    icon={Sparkles}
                                    showAiBadge>
                                    <AnalysisCard
                                        label="表扬与鼓励"
                                        value={analysisData.praise}
                                        color="success"
                                    />
                                    <AnalysisCard
                                        label="困难解决方案"
                                        value={analysisData.difficultyHelp}
                                        color="warning"
                                    />
                                    <AnalysisCard
                                        label="目标建议"
                                        value={analysisData.goalAdvice}
                                        color="info"
                                    />
                                    <AnalysisCard
                                        label="AI 助手建议"
                                        value={analysisData.aiFeedbackAdvice}
                                        color="danger"
                                    />
                                    <AnalysisCard
                                        label="总体评价"
                                        value={analysisData.summary}
                                        color="primary"
                                    />
                                </Section>
                            )}
                        </div>
                    )
                })()}
        </Modal>
    )
}

// ===== Sub-components =====

function Section({
    title,
    icon: Icon,
    children,
    showAiBadge = false,
}: {
    title: string
    icon?: React.ComponentType<{ className?: string }>
    children: React.ReactNode
    showAiBadge?: boolean
}) {
    return (
        <div className="card">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
                <h2 className="text-lg font-bold text-headline">{title}</h2>
                {showAiBadge && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-info-background text-info">
                        AI 分析
                    </span>
                )}
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    )
}

const LABEL_COLOR_MAP: Record<string, string> = {
    success: 'bg-success-background text-success',
    warning: 'bg-warning-background text-warning',
    info: 'bg-info-background text-info',
    danger: 'bg-danger-background text-danger',
    primary: 'bg-primary-background text-primary',
}

function AnalysisCard({
    label,
    value,
    color = 'primary',
}: {
    label: string
    value: string
    color?: 'success' | 'warning' | 'info' | 'danger' | 'primary'
}) {
    if (!value) return null
    return (
        <div className="pl-3 border-l-2 border-primary-background">
            <div className="flex items-center gap-2 mb-2">
                <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold ${LABEL_COLOR_MAP[color] || LABEL_COLOR_MAP.primary}`}>
                    {label}
                </span>
            </div>
            <div className="markdown-viewer" data-color-mode="light">
                <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-100">
                    <MDEditor.Markdown source={value} />
                </div>
            </div>
        </div>
    )
}

function ViewField({ label = '', value }: { label?: string; value: string }) {
    if (!value) return null
    return (
        <div className="pl-3 border-l-2 border-primary-background">
            {label && (
                <span className="block text-sm font-semibold text-primary mb-1.5">
                    {label}
                </span>
            )}
            <div className="markdown-viewer" data-color-mode="light">
                <div className="bg-gray-50/50 rounded-lg p-4 border border-gray-100">
                    <MDEditor.Markdown source={value} />
                </div>
            </div>
        </div>
    )
}
