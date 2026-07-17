'use client'

import MDEditor from '@uiw/react-md-editor'
import { Bot, Send, Loader2, Sparkles } from 'lucide-react'
import { useRef, useEffect, useState } from 'react'
import type { ChatMessage } from '@shared/types'

export interface AiChatPanelProps {
    messages: ChatMessage[]
    onSend: (message: string) => void
    sending: boolean
    onGenerateDemo?: () => void
    generatingDemo?: boolean
    aiHelperName?: string
    emptyText?: string
    inputPlaceholder?: string
    children?: React.ReactNode
}

export default function AiChatPanel({
    messages,
    onSend,
    sending,
    onGenerateDemo,
    generatingDemo,
    aiHelperName = '',
    emptyText = '你可以让 AI 生成示范作业，或在下方输入问题向我提问',
    inputPlaceholder = '输入你的问题...',
    children,
}: AiChatPanelProps) {
    const [input, setInput] = useState('')
    const chatEndRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, sending])

    // Clear input when messages are reset (e.g. task switch)
    useEffect(() => {
        if (messages.length === 0) {
            setInput('')
        }
    }, [messages.length])

    const autoResize = () => {
        const el = textareaRef.current
        if (!el) return
        el.style.height = 'auto'
        el.style.height = `${el.scrollHeight}px`
    }

    const handleSend = () => {
        if (!input.trim() || sending) return
        onSend(input.trim())
        setInput('')
        // Reset textarea height after send
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
        }
    }

    const hasDemo = typeof onGenerateDemo === 'function'

    return (
        <div className="flex flex-col h-full border-l border-gray-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                <div className="flex items-center gap-2">
                    <Bot className="size-5 text-primary" />
                    <span className="text-sm font-medium text-gray-800">
                        {aiHelperName} AI 辅导
                    </span>
                </div>
                {children}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0 scrollbar-hide">
                {messages.length === 0 && !generatingDemo && (
                    <div className="flex flex-col items-center justify-center h-full text-center px-4">
                        <Sparkles className="w-8 h-8 text-gray-300 mb-3" />
                        <p className="text-sm text-gray-400 leading-relaxed">
                            {emptyText}
                        </p>
                        {hasDemo && (
                            <button
                                onClick={onGenerateDemo}
                                disabled={generatingDemo}
                                className="mt-4 btn btn-outline btn-sm">
                                {generatingDemo ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                        生成中...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4 mr-1" />
                                        生成示范作业
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {generatingDemo && messages.length === 0 && (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div
                            className={`rounded-lg px-3 py-2 text-sm ${
                                msg.role === 'user'
                                    ? 'max-w-[80%] bg-primary text-white'
                                    : 'max-w-full bg-gray-100 text-gray-800'
                            }`}>
                            {msg.role === 'user' ? (
                                <p className="whitespace-pre-wrap">
                                    {msg.content}
                                </p>
                            ) : (
                                <div data-color-mode="light">
                                    <MDEditor.Markdown source={msg.content} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {sending && (
                    <div className="flex justify-start">
                        <div className="bg-gray-100 rounded-lg px-3 py-2">
                            <Loader2 className="size-4 animate-spin text-gray-400" />
                        </div>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* Bottom: optional demo button + input */}
            <div className="border-t border-gray-200 shrink-0">
                {hasDemo && messages.length > 0 && (
                    <div className="px-3 pt-2 pb-1">
                        <button
                            onClick={onGenerateDemo}
                            disabled={generatingDemo}
                            className="w-full btn btn-outline btn-xs text-gray-500">
                            {generatingDemo ? (
                                <>
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                    生成中...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-3 h-3 mr-1" />
                                    生成示范作业
                                </>
                            )}
                        </button>
                    </div>
                )}
                <div className="flex p-3 gap-2 flex-col">
                    <div className="flex-1 w-full px-3 py-2 border border-gray-200 rounded-lg">
                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={(e) => {
                                setInput(e.target.value)
                                autoResize()
                            }}
                            onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !e.shiftKey &&
                                    !sending
                                ) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            placeholder={inputPlaceholder}
                            rows={1}
                            className="flex-1 w-full py-1 outline-none resize-none overflow-y-auto"
                        />
                        <div className="flex justify-between items-center border-t border-gray-200 pt-2">
                            <span className="text-xs text-gray-700">
                                字数：{input.length}
                            </span>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-700">
                                    Enter 发送，Shift + Enter 换行
                                </span>
                                <button
                                    onClick={handleSend}
                                    disabled={sending || !input.trim()}
                                    className="btn btn-primary">
                                    <Send className="size-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
