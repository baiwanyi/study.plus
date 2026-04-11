import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, CircleQuestionMark } from 'lucide-react'
import { useSnackbar } from '@components/Snackbar'
import MDEditor from '@uiw/react-md-editor'

const helpTabs = [
    { key: 'faq' as const, label: '常见问题', file: '/docs/faq.md' },
    {
        key: 'markdown' as const,
        label: 'Markdown 语法',
        file: '/docs/markdown.md',
    },
    {
        key: 'mermaid' as const,
        label: 'Mermaid 思维导图',
        file: '/docs/mermaid.md',
    },
]

type HelpTabKey = (typeof helpTabs)[number]['key']

export default function Help() {
    const [showHelp, setShowHelp] = useState(false)
    const [helpTab, setHelpTab] = useState<HelpTabKey>('faq')
    const [helpContents, setHelpContents] = useState<Record<string, string>>({})
    const helpContentsRef = useRef<Record<string, string>>({})
    const { showSnackbar } = useSnackbar()

    const handleOpenHelp = useCallback(() => {
        document.body.style.overflow = 'hidden'
        setShowHelp(true)
    }, [])

    const handleCloseHelp = useCallback(() => {
        document.body.style.overflow = ''
        setShowHelp(false)
    }, [])

    // Reset overflow on unmount
    useEffect(() => {
        return () => {
            document.body.style.overflow = ''
        }
    }, [])

    // Fetch help content on tab switch
    useEffect(() => {
        if (!showHelp) return
        const entry = helpTabs.find((t) => t.key === helpTab)
        if (!entry || helpContentsRef.current[entry.key]) return
        fetch(entry.file)
            .then((res) => res.text())
            .then((text) => {
                helpContentsRef.current[entry.key] = text
                setHelpContents((prev) => ({ ...prev, [entry.key]: text }))
            })
            .catch(() => {
                showSnackbar('加载帮助文档失败')
            })
    }, [showHelp, helpTab, showSnackbar])

    return (
        <>
            <button onClick={handleOpenHelp}>
                <CircleQuestionMark className="w-5 h-5 flex-shrink-0 text-gray-600 hover:text-gray-700" />
            </button>

            {showHelp &&
                createPortal(
                    <div className="fixed inset-0 z-[9999]">
                        <div
                            className="absolute inset-0 bg-black/50"
                            onClick={handleCloseHelp}
                        />
                        <div className="relative bg-white w-full h-full overflow-y-auto">
                            <div className="sticky top-0 bg-white z-10">
                                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        帮助文档
                                    </h3>
                                    <button
                                        onClick={handleCloseHelp}
                                        className="text-gray-400 hover:text-gray-600">
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>
                                <div className="flex border-b border-gray-200">
                                    {helpTabs.map((tab) => (
                                        <button
                                            key={tab.key}
                                            onClick={() => setHelpTab(tab.key)}
                                            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                                                helpTab === tab.key
                                                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                                                    : 'text-gray-500 hover:text-gray-700'
                                            }`}>
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="p-6 prose prose-sm max-w-none">
                                <MDEditor.Markdown
                                    source={helpContents[helpTab] ?? ''}
                                />
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    )
}
