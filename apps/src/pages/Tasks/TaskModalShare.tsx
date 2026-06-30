import { useRef, useState, useEffect, useCallback, useMemo, memo } from 'react'
import { toPng } from 'html-to-image'
import mermaid from 'mermaid'
import MDEditor from '@uiw/react-md-editor'
import { BookOpen, Sparkles } from 'lucide-react'
import { defaultGradeColors } from '@apps/utils'
import Modal from '@components/Modal'
import '@apps/styles/markdown-viewer.css'
import type { Task, TaskGrade, AIScoreResult } from '@shared/types'

// ===== Mermaid rendering for share modal =====
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
})

let mermaidRenderCounter = 0

function sanitizeSvg(svg: string): string {
    return svg
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(
            /<(script|iframe|embed|object|form|input|textarea|button|select)[\s\S]*?<\/\1>/gi,
            '',
        )
        .replace(
            /<(script|iframe|embed|object|form|input|textarea|button|select)\b[^>]*\/?>/gi,
            '',
        )
        .replace(
            /((?:href|src|xlink:href)\s*=\s*)(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*')/gi,
            '$1""',
        )
}

const MermaidCodeBlock = memo(function MermaidCodeBlock({
    code,
}: {
    code: string
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        if (!containerRef.current) return
        const id = `mermaid-${++mermaidRenderCounter}`
        mermaid
            .render(id, code)
            .then(({ svg }: { svg: string }) => {
                if (!cancelled && containerRef.current) {
                    containerRef.current.innerHTML = sanitizeSvg(svg)
                    setError(null)
                }
            })
            .catch((err: Error) => {
                if (!cancelled) setError(err.message || '渲染失败')
            })
        return () => {
            cancelled = true
        }
    }, [code])

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-danger my-2">
                <p className="font-medium">思维导图渲染失败</p>
                <p className="text-xs mt-1">{error}</p>
                <pre className="text-xs mt-2 bg-red-100 p-2 rounded overflow-x-auto">
                    {code}
                </pre>
            </div>
        )
    }

    return <div ref={containerRef} className="my-2 overflow-x-auto" />
})

const MdCodeBlock = memo(function MdCodeBlock({
    className,
    children,
    ...props
}: React.HTMLAttributes<HTMLElement>) {
    const code = useMemo(
        () => extractText(children).replace(/\n$/, ''),
        [children],
    )
    const lang = useMemo(() => {
        const classList = className?.split(/\s+/) ?? []
        const langClass = classList.find((c) => c.startsWith('language-'))
        return langClass?.replace('language-', '')
    }, [className])

    if (lang === 'mermaid') {
        return <MermaidCodeBlock code={code} />
    }
    return (
        <code className={className} {...props}>
            {children}
        </code>
    )
})

function extractText(children: React.ReactNode): string {
    if (children == null || typeof children === 'boolean') return ''
    if (typeof children === 'string') return children
    if (typeof children === 'number') return String(children)
    if (Array.isArray(children)) return children.map(extractText).join('')
    if (typeof children === 'object' && 'props' in children) {
        const el = children as React.ReactElement<{
            children?: React.ReactNode
        }>
        return extractText(el.props.children)
    }
    return ''
}

// Preview options for MDEditor.Markdown with Mermaid support
const mdEditorPreviewOptions = {
    components: { code: MdCodeBlock },
}

interface TaskModalShareProps {
    open: boolean
    task: Task | null
    onCancel: () => void
}

/** 安全解析 aiScore JSON 字符串 */
function parseAiScore(raw: string | null): AIScoreResult | null {
    if (!raw) return null
    try {
        return JSON.parse(raw) as AIScoreResult
    } catch {
        return null
    }
}

export default memo(
    function TaskModalShare({ open, task, onCancel }: TaskModalShareProps) {
        const contentRef = useRef<HTMLDivElement>(null)
        const aiScore = useMemo(
            () => parseAiScore(task?.submission?.aiScore ?? null),
            [task?.submission?.aiScore],
        )

        const handleDownload = useCallback(async () => {
            if (!contentRef.current) return
            try {
                const dataUrl = await toPng(contentRef.current, {
                    pixelRatio: 2,
                    backgroundColor: '#FFFFFF',
                })
                const safeTitle = (task?.title ?? '作业').replace(
                    /[/\\:*?"<>|]/g,
                    '_',
                )
                const link = document.createElement('a')
                link.download = `分享_${safeTitle}.png`
                link.href = dataUrl
                link.click()
                link.remove()
            } catch (err) {
                console.error('导出图片失败:', err)
            }
        }, [task?.title])

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
                    {/* 作业题目 */}
                    <section className="card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                            <BookOpen className="w-5 h-5 text-primary shrink-0" />
                            <h3 className="text-lg font-bold text-headline">
                                作业题目
                            </h3>
                        </div>
                        <div className="pl-3 border-l-2 border-primary-background text-headline leading-relaxed">
                            {task?.title ?? '-'}
                        </div>
                    </section>

                    {/* 作业内容 */}
                    <section className="card">
                        <div
                            className="markdown-viewer"
                            data-color-mode="light">
                            {task?.submission?.content ? (
                                <MDEditor.Markdown
                                    source={task.submission.content}
                                    {...mdEditorPreviewOptions}
                                />
                            ) : (
                                <span className="text-gray-400">
                                    暂无提交内容
                                </span>
                            )}
                        </div>
                    </section>

                    {/* AI评分内容 */}
                    <section className="card">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-200">
                            <Sparkles className="w-5 h-5 text-primary shrink-0" />
                            <h3 className="text-lg font-bold text-headline">
                                AI评分内容
                            </h3>
                            {aiScore && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-info-background text-info">
                                    AI 分析
                                </span>
                            )}
                        </div>
                        {aiScore ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-6 pl-3">
                                    <div className="text-center space-y-1">
                                        <p className="text-xs text-gray-500 font-medium">
                                            等级
                                        </p>
                                        <span
                                            className={`badge ${defaultGradeColors[aiGrade(aiScore.grade)] ?? ''} text-base px-3 py-1`}>
                                            {aiScore.grade}
                                        </span>
                                    </div>
                                    {aiScore.score >= 0 && (
                                        <div className="text-center space-y-1">
                                            <p className="text-xs text-gray-500 font-medium">
                                                AI评分
                                            </p>
                                            <p className="text-2xl font-bold">
                                                <span className="text-danger">
                                                    {aiScore.score}
                                                </span>
                                                <span className="text-base text-gray-500">
                                                    {' '}
                                                    / 100
                                                </span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                                {aiScore.comment && (
                                    <div className="pl-3 border-l-2 border-primary-background">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-primary-background text-primary mb-2">
                                            评语
                                        </span>
                                        <p className="text-sm text-gray-700 leading-relaxed">
                                            {aiScore.comment}
                                        </p>
                                    </div>
                                )}
                                {aiScore.suggestions.length > 0 && (
                                    <div className="pl-3 border-l-2 border-amber-300">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-warning-background text-warning mb-2">
                                            改进建议
                                        </span>
                                        <ul className="text-sm text-gray-700 list-disc list-inside space-y-1.5">
                                            {aiScore.suggestions.map((s, i) => (
                                                <li
                                                    key={i}
                                                    className="leading-relaxed">
                                                    {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="pl-3 border-l-2 border-gray-300 text-sm text-gray-400">
                                {task?.aiComment ? (
                                    <>
                                        <div className="pl-3 border-l-2 border-primary-background mb-3">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-primary-background text-primary mb-2">
                                                评语
                                            </span>
                                            <p className="text-sm text-gray-700 leading-relaxed">
                                                {task.aiComment}
                                            </p>
                                        </div>
                                        {task.aiSuggestions.length > 0 && (
                                            <div className="pl-3 border-l-2 border-amber-300">
                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-semibold bg-warning-background text-warning mb-2">
                                                    改进建议
                                                </span>
                                                <ul className="text-sm text-gray-700 list-disc list-inside space-y-1.5">
                                                    {task.aiSuggestions.map(
                                                        (s, i) => (
                                                            <li
                                                                key={i}
                                                                className="leading-relaxed">
                                                                {s}
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    '暂无AI评分数据'
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </Modal>
        )
    },
    (prev, next) => prev.open === next.open && prev.task === next.task,
)

// 辅助：将 AIScoreResult 的 grade 转成 TaskGrade 颜色查找所用的类型
function aiGrade(grade: string): TaskGrade {
    return grade as TaskGrade
}
