/**
 * 看图说话图片列表页：以图片卡片网格展示已添加图片，并在卡片底部以 badge 标注评分或描述状态。
 * 复用约定：清单由 React Query 按 phototalk-images 缓存，服务端的 list 接口已聚合描述状态；
 * 图片本体由服务端从本地 unsplash/ 读出为 data URL 并优先展示，Unsplash 缩略图仅作兼容回退。
 * 关键约束：列表不展开练习历史，只呈现每张图的最新状态；未配置缩略图时显示占位图标而非空白；
 * 添加入口为独立页面，保存成功后回到本页刷新清单；图片与文案均以文本节点渲染。
 * 响应式：卡片网格在 sm/md/lg 逐级增加列数，小屏单列堆叠。
 */
'use client'

import { Image as ImageIcon, ImagePlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { phototalkApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'
import { Loading } from '@components/Loading'

export function PhotoTalk() {
    const navigate = useNavigate()
    const images = useQuery({
        queryKey: ['phototalk-images'],
        queryFn: phototalkApi.list,
    })

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold">看图说话</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        已添加 {images.data?.length ?? 0} 张图片，点击任意图片开始描述与评分。
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={() => navigate('/phototalk/pick')}
                        className="btn btn-primary gap-2">
                        <ImagePlus className="size-4" />
                        添加图片
                    </button>
                </div>
            </div>

            {images.isPending && <Loading />}
            {images.isError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {formatErrorMessage(images.error)}
                </p>
            )}
            {images.isSuccess && images.data.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center space-y-4">
                    <ImageIcon className="size-12 mx-auto text-gray-300" />
                    <p className="text-gray-500">还没有添加图片，先去搜索并保存一张吧。</p>
                    <button
                        type="button"
                        onClick={() => navigate('/phototalk/pick')}
                        className="btn btn-primary gap-2">
                        <ImagePlus className="size-4" />
                        去添加图片
                    </button>
                </div>
            )}

            {images.data && images.data.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {images.data.map((item) => {
                        const imageSrc = item.thumbnailDataUrl || item.thumbnailUrl
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => navigate(`/phototalk/${item.id}`)}
                                className="text-left rounded-xl overflow-hidden border border-gray-200 bg-white hover:border-blue-500 hover:shadow-md transition-all">
                                <div className="aspect-video w-full bg-gray-100 overflow-hidden">
                                    {imageSrc ? (
                                        <img
                                            src={imageSrc}
                                            alt={`图片 ${item.unsplashId}`}
                                            loading="lazy"
                                            className="block w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                            <ImageIcon className="size-10 text-gray-300" />
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 space-y-1">
                                    <p className="text-sm text-gray-700 line-clamp-2 min-h-10 leading-5">
                                        {item.described ? item.lastContent : '还没有描述内容'}
                                    </p>
                                    {item.described ? (
                                        <span className="badge badge-earn">
                                            评分：{item.lastScore ?? '-'} 分
                                        </span>
                                    ) : (
                                        <span className="badge badge-expired">未描述</span>
                                    )}
                                </div>
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
