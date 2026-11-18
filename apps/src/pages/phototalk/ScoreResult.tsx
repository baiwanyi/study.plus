/**
 * 评分结果卡片：展示总分、四个维度得分条、亮点与改进建议、关键词覆盖情况及参考描述。
 * 复用约定：评分结构直接采用 @shared/types 的 PictureScoreResult，与服务端 DTO 保持同型；
 * 分数条按维度满分换算百分比，展示口径与服务端钳制后的分值一致，不在前端二次计算总分。
 * 关键约束：所有 AI 文案均以文本节点渲染，不注入 HTML；参考描述直接展示，便于对照自查。
 */
'use client'

import { Sparkles } from 'lucide-react'
import type { PictureScoreResult } from '@shared/types'

interface ScoreResultProps {
    result: PictureScoreResult
}

function getLevel(score: number): string {
    if (score >= 90) return '优秀'
    if (score >= 80) return '良好'
    if (score >= 60) return '及格'
    return '继续加油'
}

export function ScoreResult({ result }: ScoreResultProps) {
    return (
        <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
            <div className="flex items-center gap-4">
                <div className="size-20 rounded-full bg-blue-50 border-4 border-blue-500 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-blue-700">{result.totalScore}</span>
                    <span className="text-xs text-blue-500">总分</span>
                </div>
                <div>
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                        <Sparkles className="size-5 text-blue-600" />
                        本次评价：{getLevel(result.totalScore)}
                    </h3>
                    <p className="text-sm text-gray-600">评分已写入练习历史，可随时回看。</p>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {result.dimensions.map((item) => {
                    const percent = item.max > 0 ? Math.round((item.score / item.max) * 100) : 0
                    return (
                        <div key={item.key} className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="font-medium text-gray-900">{item.label}</span>
                                <span className="text-gray-500">{item.score} / {item.max}</span>
                            </div>
                            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full"
                                    style={{ width: `${percent}%` }}
                                />
                            </div>
                            {item.comment && (
                                <p className="text-xs text-gray-700">{item.comment}</p>
                            )}
                        </div>
                    )
                })}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
                    <h4 className="font-semibold text-green-800">做得好的地方</h4>
                    {result.highlights.length === 0 ? (
                        <p className="text-sm text-green-700">本次暂无突出亮点。</p>
                    ) : (
                        <ul className="list-disc list-inside space-y-1 text-sm text-green-900">
                            {result.highlights.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    )}
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
                    <h4 className="font-semibold text-amber-800">可以改进的地方</h4>
                    {result.improvements.length === 0 ? (
                        <p className="text-sm text-amber-700">继续保持，继续观察更多细节。</p>
                    ) : (
                        <ul className="list-disc list-inside space-y-1 text-sm text-amber-900">
                            {result.improvements.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    )}
                </div>
            </div>

            <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
                <h4 className="font-semibold text-gray-700">关键词覆盖</h4>
                <div className="flex flex-wrap gap-2">
                    {result.keywordCoverage.covered.map((word) => (
                        <span key={word} className="badge badge-earn">
                            ✓ {word}
                        </span>
                    ))}
                    {result.keywordCoverage.missed.map((word) => (
                        <span key={word} className="badge badge-deduct">
                            ✗ {word}
                        </span>
                    ))}
                    {result.keywordCoverage.covered.length === 0 && result.keywordCoverage.missed.length === 0 && (
                        <span className="text-sm text-gray-500">本次没有可核对的关键词。</span>
                    )}
                </div>
            </div>

            {result.referenceDescription && (
                <p className="rounded-lg bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 leading-relaxed">
                    <h4 className="font-semibold text-blue-800">参考描述</h4>
                    {result.referenceDescription}
                </p>
            )}
        </section>
    )
}
