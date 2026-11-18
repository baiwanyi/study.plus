/**
 * 图片添加面板：搜索横版 Unsplash 候选，并在每张结果卡上直接触发添加。
 * 复用约定：搜索走 React Query 的 useMutation，错误文案经 formatErrorMessage 归一化；
 * 缩略图 URL 由服务端映射，本组件只做展示，不拼接任何第三方接口地址或密钥。
 * 关键约束：结果以 16:9 容器 object-cover 填满，避免上下留白；添加中锁定全部按钮，
 * 仅被点击项显示 loading，防止重复落盘与重复计费；第三方描述以文本节点渲染，不注入 HTML。
 */
'use client'

import { Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { phototalkApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'

interface ImagePickerProps {
    /** 添加进行中由父组件置位，用于锁定结果卡上的按钮 */
    picking: boolean
    onPicked: (unsplashId: string) => void
}

export function ImagePicker({ picking, onPicked }: ImagePickerProps) {
    const [keyword, setKeyword] = useState('')
    const [error, setError] = useState('')
    const [pendingId, setPendingId] = useState<string | null>(null)
    const search = useMutation({
        mutationFn: (query: string) => phototalkApi.search(query),
        onError: (err: unknown) => setError(formatErrorMessage(err)),
        onSuccess: () => setError(''),
    })

    const candidates = search.data ?? []

    useEffect(() => {
        if (!picking) setPendingId(null)
    }, [picking])

    const handlePick = (unsplashId: string) => {
        setPendingId(unsplashId)
        onPicked(unsplashId)
    }

    const handleSearch = () => {
        const value = keyword.trim()
        if (!value) {
            setError('请输入搜索关键词')
            return
        }
        search.mutate(value)
    }

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <div className="flex flex-wrap gap-3">
                    <input
                        type="text"
                        value={keyword}
                        maxLength={100}
                        onChange={(event) => setKeyword(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') handleSearch()
                        }}
                        placeholder="输入画面关键词，如：海边 日落 孩子"
                        className="flex-1 min-w-56 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                    <button
                        type="button"
                        onClick={handleSearch}
                        disabled={search.isPending}
                        className="btn btn-primary gap-2">
                        {search.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Search className="size-4" />
                        )}
                        搜索图片
                    </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <p className="text-xs text-gray-500">
                    仅显示横版图片；点击卡片上的「选择」即可下载为长边 1600px 并保存到本地 unsplash/ 目录。
                </p>
            </div>

            {search.isPending && (
                <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="size-4 animate-spin" />
                    正在搜索图片…
                </div>
            )}

            {search.isSuccess && candidates.length === 0 && (
                <p className="text-gray-500">没有找到匹配图片，请换个关键词试试。</p>
            )}

            {candidates.length > 0 && (
                <section className="space-y-3">
                    <h3 className="text-lg font-semibold">搜索结果</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                        {candidates.map((item) => (
                            <div
                                key={item.id}
                                className="rounded-xl overflow-hidden border border-gray-200 bg-white">
                                <div className="aspect-video w-full overflow-hidden bg-gray-100">
                                    <img
                                        src={item.thumbnailUrl}
                                        alt={item.description || 'Unsplash 图片'}
                                        loading="lazy"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                <div className="p-3 space-y-2">
                                    <p className="text-sm text-gray-700 line-clamp-2 min-h-10 leading-5">
                                        {item.description || '暂无画面描述'}
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-xs text-gray-400 truncate">
                                            摄影：{item.author}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handlePick(item.id)}
                                            disabled={picking}
                                            className="btn btn-primary btn-sm shrink-0">
                                            {picking && pendingId === item.id ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                '选择'
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}
