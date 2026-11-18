/**
 * 看图说话练习面板：左侧展示图片与关键词，右侧提供描述输入、草稿保存、管理员 AI 评分与生图提示词复制。
 * 复用约定：草稿保存与评分均走 phototalkApi，错误经 formatErrorMessage 归一化，管理员判定复用 isAdmin；
 * 草稿描述来自图片详情并防抖自动保存，评分结果由父组件交给 ScoreResult 展示。
 * 关键约束：草稿任意字数均可保存；评分需满 100 字且仅管理员可见，评分中禁止重复提交（一次提交即一次 AI 计费）；
 * 提示词由预设模板拼接当前描述后写入剪贴板，不发起任何请求；图片与 AI 文案均以文本节点渲染。
 */
'use client'

import { Check, Copy, Image as ImageIcon, Loader2, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { phototalkApi } from '@apps/services'
import { formatErrorMessage, isAdmin } from '@apps/utils/client'
import type { PictureDetail } from '@shared/types'
import type { PictureScoreResponse } from '@apps/services'

interface PracticePanelProps {
    image: PictureDetail
    onScored: (response: PictureScoreResponse) => void
}

const SCORE_MIN_LENGTH = 100
const MAX_LENGTH = 2000
const AUTOSAVE_DELAY_MS = 2000
const COPY_FEEDBACK_MS = 2000
const IMAGE_PROMPT_PREFIX =
    '请根据以下描述生成一张图片。风格：写实摄影，自然光，真实色彩与质感。尺寸：16:9 横版，高清画质。要求忠实呈现描述中的人物、动作、场景与光线氛围，画面清晰、构图自然、细节丰富、色彩协调。'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function PracticePanel({ image, onScored }: PracticePanelProps) {
    const admin = isAdmin()
    const [description, setDescription] = useState(image.draftContent ?? '')
    const [error, setError] = useState('')
    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
    const [copied, setCopied] = useState(false)
    const lastSavedRef = useRef(image.draftContent ?? '')

    const saveDraft = useCallback(
        async (content: string) => {
            setSaveStatus('saving')
            try {
                await phototalkApi.saveDraft(image.id, content)
                lastSavedRef.current = content
                setSaveStatus('saved')
            } catch (err: unknown) {
                setError(formatErrorMessage(err))
                setSaveStatus('error')
            }
        },
        [image.id],
    )

    useEffect(() => {
        if (description === lastSavedRef.current) return
        const timer = setTimeout(() => {
            void saveDraft(description)
        }, AUTOSAVE_DELAY_MS)
        return () => clearTimeout(timer)
    }, [description, saveDraft])

    const score = useMutation({
        mutationFn: () => phototalkApi.score(image.id, description),
        onSuccess: (response) => {
            setError('')
            onScored(response)
        },
        onError: (err: unknown) => setError(formatErrorMessage(err)),
    })

    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
        return () => clearTimeout(timer)
    }, [copied])

    const copyImagePrompt = useCallback(async () => {
        const content = description.trim()
        if (!content) {
            setError('请先填写描述内容，再生成提示词。')
            return
        }
        try {
            await navigator.clipboard.writeText(
                `${IMAGE_PROMPT_PREFIX}\n\n描述内容：\n${content}`,
            )
            setError('')
            setCopied(true)
        } catch (err: unknown) {
            setError(`复制提示词失败：${formatErrorMessage(err)}`)
        }
    }, [description])

    const length = description.trim().length
    const canSave = saveStatus !== 'saving'
    const canScore = length >= SCORE_MIN_LENGTH && !score.isPending

    return (
        <div className="grid gap-6 lg:grid-cols-2">
            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ImageIcon className="size-5" />
                    观察图片
                </h3>
                <div className="aspect-video w-full bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                    <img
                        src={image.imageDataUrl}
                        alt="看图说话练习图片"
                        className="w-full h-full object-cover"
                    />
                </div>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">
                        关键词提示
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {image.keywords.length === 0 ? (
                            <span className="text-sm text-gray-500">
                                暂无提示，请自行观察画面。
                            </span>
                        ) : (
                            image.keywords.map((word) => (
                                <span
                                    key={word}
                                    className="badge badge-keyword">
                                    {word}
                                </span>
                            ))
                        )}
                    </div>
                </div>
            </section>

            <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="text-lg font-semibold">写下你看到的内容</h3>
                <div className="rounded-lg border border-gray-300 bg-gray-50 px-4 py-3 focus-within:border-primary transition-colors">
                    <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={MAX_LENGTH}
                        rows={12}
                        placeholder="试着按顺序描述：画面中有什么人？他们在做什么？环境和光线给你什么感受？"
                        className="w-full bg-transparent text-gray-900 placeholder-gray-500 resize-none overflow-y-auto focus:outline-none"
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                        <span>
                            {length >= SCORE_MIN_LENGTH
                                ? '字数已满足评分要求'
                                : `至少还需 ${SCORE_MIN_LENGTH - length} 字才能评分`}
                        </span>
                        <span>剩余 {MAX_LENGTH - description.length} 字</span>
                    </div>
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void saveDraft(description)}
                            disabled={!canSave}
                            className="btn btn-primary gap-2">
                            {saveStatus === 'saving' ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Save className="size-4" />
                            )}
                            保存更改
                        </button>
                        {saveStatus === 'saved' && (
                            <span className="text-xs text-gray-400">
                                已自动保存
                            </span>
                        )}
                        {saveStatus === 'error' && (
                            <span className="text-xs text-danger">
                                保存失败，请重试
                            </span>
                        )}
                    </div>
                    {admin && (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => score.mutate()}
                                disabled={!canScore}
                                className="btn btn-outline gap-2">
                                {score.isPending ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Sparkles className="size-4" />
                                )}
                                {score.isPending ? 'AI 正在评分…' : 'AI 评分'}
                            </button>
                            <button
                                type="button"
                                onClick={() => void copyImagePrompt()}
                                disabled={!description.trim()}
                                className="btn btn-outline gap-2">
                                {copied ? (
                                    <Check className="size-4" />
                                ) : (
                                    <Copy className="size-4" />
                                )}
                                {copied ? '已复制' : '提示词'}
                            </button>
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}
