/**
 * 看图说话练习独立页：按 URL 中的图片 ID 读取本地图片，完成描述、评分与结果展示。
 * 复用约定：图片详情由 React Query 缓存，练习交互复用 PracticePanel，评分结果交给 ScoreResult 渲染；
 * 评分成功后失效列表 queryKey，返回列表页即可看到最新的描述状态与分数。
 * 关键约束：非法图片 ID 不发请求并给出明确提示；图片不存在返回 404 文案；
 * 进入页面即展示该图片最近一次评分记录，本次会话的新评分优先覆盖；描述文本在切换状态时不丢失。
 */
'use client'

import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { phototalkApi } from '@apps/services'
import { formatErrorMessage } from '@apps/utils/client'
import type { PictureScoreResponse } from '@apps/services'
import { PracticePanel } from './PracticePanel'
import { ScoreResult } from './ScoreResult'

export function PhotoTalkPractice() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const queryClient = useQueryClient()
    const [response, setResponse] = useState<PictureScoreResponse | null>(null)
    const imageId = Number(id)
    const validId = Number.isInteger(imageId) && imageId > 0

    const detail = useQuery({
        queryKey: ['phototalk-detail', imageId],
        queryFn: () => phototalkApi.detail(imageId),
        enabled: validId,
    })

    const handleScored = (value: PictureScoreResponse) => {
        setResponse(value)
        queryClient.invalidateQueries({ queryKey: ['phototalk-images'] })
    }

    const lastSubmission = detail.data?.lastSubmission
    const scoreResponse: PictureScoreResponse | null = response ?? (
        lastSubmission?.aiResult
            ? { submission: lastSubmission, aiResult: lastSubmission.aiResult }
            : null
    )

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold">看图说话练习</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        仔细观察画面，写下你的描述，AI 会从四个维度给出反馈。
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

            {!validId && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    图片 ID 不合法，请从图片列表进入。
                </p>
            )}

            {detail.isPending && validId && (
                <p className="text-gray-500">正在加载图片…</p>
            )}
            {detail.isError && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {formatErrorMessage(detail.error)}
                </p>
            )}

            {detail.data && (
                <div className="space-y-6">
                    <PracticePanel
                        image={detail.data}
                        onScored={handleScored}
                    />
                    {scoreResponse && (
                        <ScoreResult result={scoreResponse.aiResult} />
                    )}
                </div>
            )}
        </div>
    )
}
