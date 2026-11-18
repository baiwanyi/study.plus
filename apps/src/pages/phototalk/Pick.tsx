/**
 * 图片添加独立页：搜索 Unsplash、选中图片并由服务端保存到本地，完成后返回图片列表。
 * 复用约定：选择与搜索交互由 ImagePicker 承载，本页只负责保存调用、错误提示与路由跳转，
 * 统一复用 phototalkApi 与 formatErrorMessage；成功后回到 /phototalk 查看添加结果。
 * 关键约束：保存按图片 ID 幂等，重复选中不会重复下载；保存期间锁定交互，避免重复提交；
 * 服务端未配置 Unsplash Key 时展示明确错误，不向前端暴露任何密钥信息。
 */
'use client'

import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { phototalkApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'
import { ImagePicker } from './ImagePicker'

export function PhotoTalkPick() {
    const navigate = useNavigate()
    const [picking, setPicking] = useState(false)
    const [error, setError] = useState('')

    const handlePicked = async (unsplashId: string) => {
        setPicking(true)
        setError('')
        try {
            await phototalkApi.save(unsplashId)
            navigate('/phototalk')
        } catch (err: unknown) {
            setError(formatErrorMessage(err))
        } finally {
            setPicking(false)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold">添加图片</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        搜索并选中一张图片，保存后即可回到列表开始看图说话。
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/phototalk')}
                    className="btn btn-outline gap-2">
                    <ArrowLeft className="size-4" />
                    返回图片列表
                </button>
            </div>

            {error && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {error}
                </p>
            )}

            <ImagePicker picking={picking} onPicked={handlePicked} />
        </div>
    )
}
