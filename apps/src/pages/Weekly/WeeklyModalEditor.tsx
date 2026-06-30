import { useState, useRef, useEffect } from 'react'
import MDEditor from '@uiw/react-md-editor'
import {
    Bot,
    Loader2,
    Check,
    Send,
    Rows2,
    MessageSquareText,
    ClipboardList,
    Sparkles,
} from 'lucide-react'
import Modal from '@components/Modal'
import Tabs from '@components/Tabs'
import type { WeeklyAnalysis, WeeklyMessage } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'
import '@apps/styles/markdown-viewer.css'

// ===== Constants =====

const SMART_TABS = [
    { key: 'S' as const, label: 'S - 具体的' },
    { key: 'M' as const, label: 'M - 可衡量' },
    { key: 'A' as const, label: 'A - 可实现' },
    { key: 'R' as const, label: 'R - 相关' },
    { key: 'T' as const, label: 'T - 有时限' },
] as const

const SMART_HINTS: Record<string, string> = {
    S: '目标要明确，不能模糊。❌ "学好数学" ✅ "掌握分数除法应用题，能正确列式解答"',
    M: '要有完成标准，能判断是否达成。❌ "多背单词" ✅ "默写Unit 3的15个单词，错误不超过2个"',
    A: '跳一跳够得着，不要太高或太低。❌ "一周数学考100分" ✅ "一周内每天做3道错题本上的同类题"',
    R: '和当前学习重点、弱项相关。❌ "学下学期的物理" ✅ "本周解决英语一般过去时不规则动词混淆"',
    T: '有明确截止时间。❌ "以后提高作文水平" ✅ "周五前完成一篇400字写人作文，并修改两处细节"',
}

const PLACEHOLDERS: Record<string, string> = {
    learned: '例：数学——分数乘法简便运算；英语——一般过去时动词变化',
    difficulties: '例：语文阅读理解中的概括题容易漏点；数学概念理解模糊',
    weakPoints: '例：英语不规则动词表还有5个不熟；化学方程式配平',
    achievement:
        '鼓励写下进步，如\u201c独立解出一道难题\u201d\u201c坚持早读3天\u201d',
    lastWeekGoalReview: '回顾上周 SMART 目标的完成情况，达到了哪些、未完成哪些',
    improvement: '例：用荧光笔划重点；先复习再做作业；睡前回忆当天知识点',
}

// ===== Props =====

export interface WeeklyModalEditorProps {
    open: boolean
    weekNumber: number
    form: WeeklyReportContent
    onFormChange: (field: keyof WeeklyReportContent, value: string) => void
    analysis: WeeklyAnalysis | null
    analyzing: boolean
    chatMessages: WeeklyMessage[]
    chatInput: string
    onChatInputChange: (value: string) => void
    chatting: boolean
    onChat: () => void
    onAnalyze: () => void
    onConfirm: () => void
    isDisabled: boolean
    onCancel: () => void
    aiHelperName?: string
}

// ===== Component =====

export default function WeeklyModalEditor({
    open,
    weekNumber,
    form,
    onFormChange,
    analysis,
    analyzing,
    chatMessages,
    chatInput,
    onChatInputChange,
    chatting,
    onChat,
    onAnalyze,
    onConfirm,
    isDisabled,
    onCancel,
    aiHelperName = '费曼',
}: WeeklyModalEditorProps) {
    const [smartTab, setSmartTab] = useState('S')
    const [viewMode, setViewMode] = useState<'analysis' | 'chat' | 'split'>(
        'split',
    )
    const chatEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [chatMessages, chatting])

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            title={`第${weekNumber}周学习周报`}
            onConfirm={onConfirm}
            confirmLabel="保存更改"
            isDisabled={isDisabled}
            size="full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                {/* ===== Left: Form ===== */}
                <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-10rem)] p-3">
                    <h4 className="font-semibold text-lg">本周总结</h4>
                    <MarkdownField
                        label="学到的东西"
                        value={form.learned}
                        onChange={(v) => onFormChange('learned', v)}
                        placeholder={PLACEHOLDERS.learned}
                    />
                    <MarkdownField
                        label="遇到的困难"
                        value={form.difficulties}
                        onChange={(v) => onFormChange('difficulties', v)}
                        placeholder={PLACEHOLDERS.difficulties}
                    />
                    <MarkdownField
                        label="没有掌握的知识点"
                        value={form.weakPoints}
                        onChange={(v) => onFormChange('weakPoints', v)}
                        placeholder={PLACEHOLDERS.weakPoints}
                    />
                    <MarkdownField
                        label="本周最有成就感的一件事"
                        value={form.achievement}
                        onChange={(v) => onFormChange('achievement', v)}
                        placeholder={PLACEHOLDERS.achievement}
                    />
                    <MarkdownField
                        label="上周目标达成情况"
                        value={form.lastWeekGoalReview}
                        onChange={(v) => onFormChange('lastWeekGoalReview', v)}
                        placeholder={PLACEHOLDERS.lastWeekGoalReview}
                    />

                    <h4 className="font-semibold text-lg">
                        下周规划 — SMART 目标
                    </h4>
                    <Tabs
                        tabs={[...SMART_TABS]}
                        active={smartTab}
                        onChange={setSmartTab}
                        background="gray"
                    />
                    <MarkdownField
                        value={
                            form[
                                `smartGoal${smartTab}` as keyof WeeklyReportContent
                            ] as string
                        }
                        onChange={(v) =>
                            onFormChange(
                                `smartGoal${smartTab}` as keyof WeeklyReportContent,
                                v,
                            )
                        }
                        placeholder={SMART_HINTS[smartTab]}
                    />

                    <h4 className="font-semibold text-lg">改进方法</h4>
                    <MarkdownField
                        value={form.improvement}
                        onChange={(v) => onFormChange('improvement', v)}
                        placeholder={PLACEHOLDERS.improvement}
                    />
                </div>

                {/* ===== Right: AI Analysis + Chat ===== */}
                <div className="border-l border-gray-200 flex flex-col h-full max-h-[calc(90vh-10rem)] border border-border rounded-md">
                    {/* Header with mode toggle */}
                    <div className="flex justify-between items-center p-3 border-b border-gray-200 shrink-0">
                        <h4 className="font-semibold text-lg flex items-center gap-2">
                            <Bot className="size-5" />
                            {aiHelperName} AI 助手
                        </h4>
                        <div className="flex gap-1">
                            <AiViewToggle
                                viewMode={viewMode}
                                onChange={setViewMode}
                            />
                        </div>
                    </div>

                    {/* Analysis Section */}
                    {(viewMode === 'analysis' || viewMode === 'split') && (
                        <>
                            {!analysis && !analyzing && (
                                <div className="text-sm text-gray-400 text-center py-12">
                                    保存周报并点击"保存并分析"后，AI
                                    分析结果将显示在这里
                                </div>
                            )}

                            {analyzing && (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            )}

                            {analysis && !analyzing && (
                                <AnalysisCards
                                    analysis={analysis}
                                    isSplit={viewMode === 'split'}
                                />
                            )}
                        </>
                    )}

                    {/* Chat Area */}
                    {(viewMode === 'chat' || viewMode === 'split') && (
                        <div className="flex flex-col flex-1 min-h-0">
                            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                                {chatMessages.length === 0 && (
                                    <EmptyChatState />
                                )}
                                {chatMessages.map((msg, i) => (
                                    <div
                                        key={i}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`rounded-lg px-3 py-2 text-sm ${
                                                msg.role === 'user'
                                                    ? 'max-w-[80%] bg-primary text-white '
                                                    : 'max-w-full bg-gray-100 text-gray-800'
                                            }`}>
                                            {msg.role === 'user' ? (
                                                <p className="whitespace-pre-wrap">
                                                    {msg.content}
                                                </p>
                                            ) : (
                                                <div
                                                    data-color-mode="light">
                                                    <MDEditor.Markdown
                                                        source={msg.content}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                {chatting && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-100 rounded-lg px-3 py-2">
                                            <Loader2 className="size-4 animate-spin text-gray-400" />
                                        </div>
                                    </div>
                                )}
                                <div ref={chatEndRef} />
                            </div>
                            <div className="border-t border-gray-200 p-3 flex gap-2 shrink-0">
                                <button
                                    onClick={onAnalyze}
                                    disabled={analyzing}
                                    className="btn btn-outline btn-sm shrink-0"
                                    title="周报分析">
                                    {analyzing ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="size-4" />
                                    )}
                                    <span>周报分析</span>
                                </button>
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) =>
                                        onChatInputChange(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                        e.key === 'Enter' &&
                                        !chatting &&
                                        onChat()
                                    }
                                    placeholder="输入你的问题..."
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                                <button
                                    onClick={onChat}
                                    disabled={chatting || !chatInput.trim()}
                                    className="btn btn-primary btn-sm">
                                    <Send className="size-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    )
}

// ===== Sub-components =====

const AI_VIEW_MODES: {
    key: 'analysis' | 'chat' | 'split'
    icon: typeof Rows2
    title: string
}[] = [
    { key: 'split', icon: Rows2, title: '分栏显示' },
    { key: 'analysis', icon: ClipboardList, title: '仅显示分析' },
    { key: 'chat', icon: MessageSquareText, title: '仅显示对话' },
]

function AiViewToggle({
    viewMode,
    onChange,
}: {
    viewMode: 'analysis' | 'chat' | 'split'
    onChange: (mode: 'analysis' | 'chat' | 'split') => void
}) {
    return (
        <div className="flex gap-1">
            {AI_VIEW_MODES.map(({ key, icon: Icon, title }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    className={`p-1.5 rounded text-xs ${
                        viewMode === key
                            ? 'bg-primary/10 text-primary'
                            : 'text-gray-400 hover:text-gray-600'
                    }`}
                    title={title}>
                    <Icon className="size-4" />
                </button>
            ))}
        </div>
    )
}

function AnalysisCards({
    analysis,
    isSplit,
}: {
    analysis: WeeklyAnalysis
    isSplit: boolean
}) {
    const cards: {
        label: string
        value: string
        bg: string
        border: string
        text: string
    }[] = [
        {
            label: '表扬与鼓励',
            value: analysis.praise,
            bg: 'bg-green-50',
            border: 'border-green-200',
            text: 'text-green-700',
        },
        {
            label: '困难与解决方案',
            value: analysis.difficultyHelp,
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            text: 'text-amber-700',
        },
        {
            label: '目标与计划建议',
            value: analysis.goalAdvice,
            bg: 'bg-blue-50',
            border: 'border-blue-200',
            text: 'text-blue-700',
        },
        {
            label: 'AI 助手建议',
            value: analysis.aiFeedbackAdvice,
            bg: 'bg-purple-50',
            border: 'border-purple-200',
            text: 'text-purple-700',
        },
        {
            label: '总体评价',
            value: analysis.summary,
            bg: 'bg-gray-50',
            border: 'border-gray-200',
            text: 'text-gray-700',
        },
    ]

    return (
        <div
            className={`space-y-2 text-sm overflow-y-auto p-2 ${isSplit ? 'shrink-0 max-h-[40%]' : 'flex-1'}`}>
            {cards.map(({ label, value, bg, border, text }) => (
                <div
                    key={label}
                    className={`${bg} border ${border} rounded-lg p-3`}>
                    <h5 className="font-semibold text-gray-800 mb-1 text-xs">
                        {label}
                    </h5>
                    <p className={`${text} whitespace-pre-wrap text-xs`}>
                        {value}
                    </p>
                </div>
            ))}
        </div>
    )
}

function EmptyChatState() {
    const items = [
        '我知道具体要做什么。',
        '我能自己判断完成没完成（有数字/标准）。',
        '我觉得努努力就能做到。',
        '这事对我这周的学习有帮助。',
        '我知道最晚哪天做完。',
    ]

    return (
        <>
            <div className="text-sm text-gray-400 text-center py-4">
                AI 分析后可以在这里继续提问
            </div>
            <div className="text-sm text-gray-600 text-start px-2 pb-4 space-y-1.5">
                <p className="font-medium mb-2">"聪明目标"检查清单：</p>
                {items.map((text) => (
                    <p key={text} className="flex items-start gap-2">
                        <Check className="size-4 text-success shrink-0 mt-0.5" />{' '}
                        {text}
                    </p>
                ))}
            </div>
        </>
    )
}

function MarkdownField({
    label = '',
    value,
    onChange,
    placeholder,
}: {
    label?: string
    value: string
    onChange: (val: string) => void
    placeholder?: string
}) {
    return (
        <div className="space-y-1">
            {label && (
                <label className="text-sm font-medium text-gray-700">
                    {label}
                </label>
            )}
            <div className="[&_.w-md-editor]:h-auto! [&_.w-md-editor-content]:h-auto! [&_.w-md-editor-text]:min-h-15!">
                <MDEditor
                    value={value}
                    onChange={(val) => onChange(val ?? '')}
                    preview="edit"
                    hideToolbar
                    textareaProps={{ placeholder }}
                />
            </div>
        </div>
    )
}
