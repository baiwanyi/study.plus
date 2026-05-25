import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react'
import MDEditor from '@uiw/react-md-editor'
import mermaid from 'mermaid'
import { Sparkles, Loader2, Check } from 'lucide-react'
import { tasksApi, systemAPI } from '@apps/lib/api'
import type { Task } from '@apps/lib/types'
import {
    taskTypeLabels,
    taskTypeColors,
    formatErrorMessage,
} from '@apps/lib/utils'
import { useSnackbar } from '@components/Snackbar'

export interface EditTaskProps {
    task: Task | null
    onCancel: () => void
}

export default function EditTask({ task, onCancel }: EditTaskProps) {
    const { showSnackbar } = useSnackbar()

    const [mdContent, setMdContent] = useState('')
    const [saving, setSaving] = useState(false)
    const [lastSaved, setLastSaved] = useState<Date | null>(null)
    const [autosaveStatus, setAutosaveStatus] = useState<
        'idle' | 'saving' | 'saved' | 'error'
    >('idle')
    const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const lastSavedContentRef = useRef<string>('')
    const autosaveIntervalRef = useRef<number>(10) // default 10s
    const editingTaskIdRef = useRef<number | null>(null)
    const [generatingTitle, setGeneratingTitle] = useState(false)
    const [currentTask, setCurrentTask] = useState<Task | null>(null)

    // Sync task from props
    useEffect(() => {
        if (task) {
            setCurrentTask(task)
            editingTaskIdRef.current = task.id
            const content = task.submission?.content ?? ''
            setMdContent(content)
            lastSavedContentRef.current = content
            setLastSaved(null)
            setAutosaveStatus('idle')
        } else {
            setCurrentTask(null)
            editingTaskIdRef.current = null
        }
    }, [task])

    // Fetch autosave config on mount
    useEffect(() => {
        systemAPI
            .get()
            .then((cfg) => {
                const interval = Number(cfg.autosaveInterval)
                if (Number.isFinite(interval) && interval > 0) {
                    autosaveIntervalRef.current = interval
                }
            })
            .catch((err) => {
                console.warn(
                    '[TaskEdit] Failed to load autosave config, using default 10s:',
                    err,
                )
            })
    }, [])

    const doSave = useCallback(
        async (content: string) => {
            if (!currentTask || !content.trim()) return
            if (editingTaskIdRef.current !== currentTask.id) return
            setAutosaveStatus('saving')
            try {
                await tasksApi.submit(currentTask.id, {
                    content: content.trim(),
                })
                if (editingTaskIdRef.current !== currentTask.id) return
                lastSavedContentRef.current = content
                setLastSaved(new Date())
                setAutosaveStatus('saved')
            } catch {
                setAutosaveStatus('error')
            }
        },
        [currentTask],
    )

    // Manual save (close after save)
    const handleSave = async () => {
        if (!currentTask || !mdContent.trim()) return
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
            autosaveTimerRef.current = null
        }
        setSaving(true)
        try {
            await tasksApi.submit(currentTask.id, {
                content: mdContent.trim(),
            })
            showSnackbar('保存成功')
            onCancel()
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    // Autosave effect: trigger on content change, debounce
    useEffect(() => {
        if (!currentTask) return
        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current)
        }
        if (mdContent === lastSavedContentRef.current) return
        autosaveTimerRef.current = setTimeout(() => {
            doSave(mdContent)
        }, autosaveIntervalRef.current * 1000)
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
            }
        }
    }, [currentTask, mdContent, doSave])

    // AI generate title based on submission content
    const handleAiTitle = async () => {
        if (!currentTask) return
        setGeneratingTitle(true)
        try {
            const res = await tasksApi.aiTitle(currentTask.id)
            setCurrentTask({ ...currentTask, title: res.title })
            showSnackbar('AI起名成功')
        } catch (err) {
            showSnackbar('AI起名失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setGeneratingTitle(false)
        }
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current)
            }
        }
    }, [])

    if (!currentTask) return null

    const hasSuggestions =
        currentTask.aiSuggestions && currentTask.aiSuggestions.length > 0

    const autoconfirmLabel =
        autosaveStatus === 'saving'
            ? '自动保存中...'
            : autosaveStatus === 'error'
              ? '自动保存失败'
              : lastSaved
                ? `已自动保存 ${lastSaved.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                : '未保存'

    return (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col">
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center justify-between gap-3">
                    <span
                        className={`badge ${taskTypeColors[currentTask.type]}`}>
                        {taskTypeLabels[currentTask.type]}
                    </span>
                    <h2 className="text-sm font-normal text-gray-900">
                        {currentTask.title}
                    </h2>
                    {currentTask.title.startsWith('未命名') && (
                        <button
                            onClick={handleAiTitle}
                            disabled={generatingTitle}
                            className="btn-outline btn-sm">
                            {generatingTitle ? 'AI起名中...' : 'AI起名'}
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="btn-outline">
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-primary">
                        {saving ? '保存中...' : '保存并关闭'}
                    </button>
                </div>
            </div>

            {/* AI 改进建议 */}
            {hasSuggestions && (
                <div className="bg-amber-50 border-b border-warning-background px-6 py-3 shrink-0">
                    <div className="flex items-start gap-2">
                        <Sparkles className="w-5 h-5 text-warning shrink-0" />
                        <div className="space-y-1 text-sm font-medium text-warning">
                            <h6 className="text-warning">改进建议</h6>
                            <ul className="list-disc list-inside">
                                {currentTask.aiSuggestions!.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden" data-color-mode="light">
                <MDEditor
                    value={mdContent}
                    onChange={(val: string) => setMdContent(val ?? '')}
                    height="100%"
                    preview="live"
                    hideToolbar={false}
                    previewOptions={mdEditorPreviewOptions}
                />
            </div>

            <div className="bg-gray-100 border-t border-gray-200 px-4 py-1.5 flex items-center justify-between text-xs text-gray-500 shrink-0">
                <div className="flex items-center gap-4">
                    <span>{mdContent.length} 字符</span>
                    <span
                        className={`flex items-center gap-1 ${autosaveStatus === 'saving' ? 'text-warning' : autosaveStatus === 'saved' ? 'text-success' : autosaveStatus === 'error' ? 'text-danger' : 'text-muted'}`}>
                        {autosaveStatus === 'saving' && (
                            <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {autosaveStatus === 'saved' && (
                            <Check className="w-3 h-3" />
                        )}
                    </span>
                </div>
                <span>{autoconfirmLabel}</span>
            </div>
        </div>
    )
}

// ===== Mermaid support for MDEditor preview =====
mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict',
})

// Monotonic counter for unique mermaid render IDs
let mermaidRenderCounter = 0

// Sanitize SVG: strip event handlers and dangerous elements to prevent XSS
function sanitizeSvg(svg: string): string {
    return (
        svg
            // Remove event handler attributes
            .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            // Remove dangerous elements
            .replace(
                /<(script|iframe|embed|object|form|input|textarea|button|select)[\s\S]*?<\/\1>/gi,
                '',
            )
            .replace(
                /<(script|iframe|embed|object|form|input|textarea|button|select)\b[^>]*\/?>/gi,
                '',
            )
            // Remove javascript:/data: protocol in href/src/xlink:href
            .replace(
                /((?:href|src|xlink:href)\s*=\s*)(?:"(?:javascript|data):[^"]*"|'(?:javascript|data):[^']*')/gi,
                '$1""',
            )
    )
}

// Mermaid code block renderer for MDEditor preview (memoized to avoid re-renders)
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

// Custom code component for MDEditor preview to render mermaid blocks (memoized)
const MdCodeBlock = memo(function MdCodeBlock({
    className,
    children,
    node,
    ...props
}: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
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

// Helper: extract plain text from React children
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

// Preview options for MDEditor with mermaid support
const mdEditorPreviewOptions = {
    components: { code: MdCodeBlock },
}
