import { useState, useCallback, useEffect } from 'react'
import Modal from '@apps/components/Modal'
import Loading from '@apps/components/Loading'
import { ExternalLink, ChevronDown } from 'lucide-react'
import { pointsApi, quotesApi } from '@apps/lib/api'
import type { ShareStats } from '@apps/lib/types'
import { formatNumber, formatErrorMessage } from '@apps/lib/utils'
import '@pages/share.css'
import { toPng } from 'html-to-image'

const IMAGE_URLS = [
    '/images/share-1.jpg',
    '/images/share-2.jpg',
    '/images/share-3.jpg',
    '/images/share-4.jpg',
    '/images/share-5.jpg',
]

function getCurrentMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function StatCard({
    title,
    children,
    className,
}: {
    title: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={`bg-gray-50 rounded-lg p-3 ${className ?? ''}`}>
            <h4 className="text-xs text-gray-500 mb-1">{title}</h4>
            {children}
        </div>
    )
}

export default function Share() {
    const [showShare, setShowShare] = useState(false)
    const [imageUrl, setImageUrl] = useState(IMAGE_URLS[0])
    const [month, setMonth] = useState(getCurrentMonth())
    const [stats, setStats] = useState<ShareStats | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [availableMonths, setAvailableMonths] = useState<string[]>([])
    const [showMonthList, setShowMonthList] = useState(false)
    const [quote, setQuote] = useState('')

    const handleOpenShare = useCallback(() => {
        const randomIndex = Math.floor(Math.random() * IMAGE_URLS.length)
        setImageUrl(IMAGE_URLS[randomIndex])
        setShowShare(true)
    }, [])

    const handleCloseShare = useCallback(() => setShowShare(false), [])

    const formatMonthLabel = (m: string): string => {
        const [y, mon] = m.split('-')
        return `${y}年${mon.replace(/^0/, '')}月`
    }

    useEffect(() => {
        if (!showShare) return
        let cancelled = false

        setLoading(true)
        setError('')
        setShowMonthList(false)

        // Fetch available months, stats, and a random quote in parallel
        Promise.all([
            pointsApi.availableMonths(),
            pointsApi.shareStats(month),
            quotesApi.get(),
        ])
            .then(([months, data, quotes]) => {
                if (!cancelled) {
                    setAvailableMonths(months)
                    setStats(data)
                    setQuote(
                        quotes[Math.floor(Math.random() * quotes.length)] || '',
                    )
                    setLoading(false)
                }
            })
            .catch((err: Error) => {
                if (!cancelled) {
                    setError(err.message)
                    setLoading(false)
                }
            })

        return () => {
            cancelled = true
        }
    }, [showShare, month])

    const handleMonthSelect = useCallback((m: string) => {
        setMonth(m)
        setShowMonthList(false)
    }, [])

    const handleDownload = useCallback(async () => {
        const el = document.getElementById('share')
        if (!el) return
        try {
            const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true })
            const a = document.createElement('a')
            a.href = dataUrl
            a.download = `${month}-学习报告.png`
            a.click()
        } catch (err) {
            console.error('下载失败:', err)
        }
    }, [month])

    const handleCopy = useCallback(async () => {
        const el = document.getElementById('share')
        if (!el) return
        try {
            const dataUrl = await toPng(el, { pixelRatio: 2, cacheBust: true })
            const res = await fetch(dataUrl)
            const blob = await res.blob()
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
            ])
        } catch (err) {
            console.error('复制失败:', formatErrorMessage(err))
        }
    }, [])

    const formatDuration = (minutes: number): string => {
        if (minutes < 60) return `${minutes} 分钟`
        const hours = Math.floor(minutes / 60)
        const mins = minutes % 60
        return `${hours} 小时${mins > 0 ? ` ${mins} 分钟` : ''}`
    }

    const formatDate = (iso: string): string => {
        if (!iso) return '-'
        const d = new Date(iso)
        return `${d.getMonth() + 1}月${d.getDate()}日`
    }

    const formatRatio = (part: number, total: number): string => {
        if (total === 0) return '0%'
        return `${((part / total) * 100).toFixed(0)}%`
    }

    return (
        <>
            <button onClick={handleOpenShare}>
                <ExternalLink className="size-5 shrink-0 text-gray-600 hover:text-headline" />
            </button>

            <Modal
                open={showShare}
                onCancel={handleCloseShare}
                footer={false}
                title="分享">
                {/* Stats content */}
                {loading && <Loading />}

                {error && (
                    <div className="text-center py-8 text-sm text-danger">
                        {error}
                    </div>
                )}

                {stats && (
                    <div className="flex flex-col space-y-4">
                        <div id="share" className="flex flex-col space-y-4 p-6">
                            <div className="relative aspect-video overflow-hidden rounded-lg">
                                <img
                                    src={imageUrl}
                                    className="w-full h-auto object-cover"
                                />
                                <div className="share-images-gradient" />
                                <div className="absolute top-1 right-1">
                                    <button
                                        onClick={() =>
                                            setShowMonthList((v) => !v)
                                        }
                                        className="flex items-center gap-1 text-white text-xs bg-black/40 px-2 py-0.5 rounded cursor-pointer hover:bg-black/60">
                                        {formatMonthLabel(month)}
                                        <ChevronDown className="w-3 h-3" />
                                    </button>
                                    {showMonthList && (
                                        <div className="absolute right-0 top-6 mt-1 bg-white rounded shadow-lg border border-gray-200 py-1 max-h-40 overflow-y-auto z-10 min-w-30">
                                            {availableMonths.map((m) => (
                                                <button
                                                    key={m}
                                                    onClick={() =>
                                                        handleMonthSelect(m)
                                                    }
                                                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 ${
                                                        m === month
                                                            ? 'text-primary font-semibold bg-primary/5'
                                                            : 'text-gray-700'
                                                    }`}>
                                                    {formatMonthLabel(m)}
                                                </button>
                                            ))}
                                            {availableMonths.length === 0 && (
                                                <div className="px-3 py-1.5 text-xs text-gray-400">
                                                    暂无数据
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="absolute bottom-5 left-5 z-10">
                                    <div className="share-quote-icon" />
                                    <span className="share-quote-text">
                                        {quote}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {/* Section 1: Monthly summary (placed first) */}
                                <StatCard title="💰 月度汇总">
                                    <div className="grid grid-cols-2 gap-y-2 gap-x-4">
                                        <div className="flex justify-between">
                                            <span className="text-sm text-gray-600">
                                                总加分
                                            </span>
                                            <span className="text-sm font-semibold text-success">
                                                +{formatNumber(stats.totalEarn)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-gray-600">
                                                总扣分
                                            </span>
                                            <span className="text-sm font-semibold text-danger">
                                                -
                                                {formatNumber(
                                                    stats.totalDeduct,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-gray-600">
                                                总兑换
                                            </span>
                                            <span className="text-sm font-semibold text-warning">
                                                -
                                                {formatNumber(
                                                    stats.totalExchanges,
                                                )}
                                            </span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-sm text-gray-600">
                                                可用余额
                                            </span>
                                            <span className="text-sm font-semibold text-primary">
                                                {formatNumber(
                                                    stats.availableBalance,
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200">
                                        <span className="text-sm text-gray-500">
                                            当前余额
                                        </span>
                                        <span className="text-2xl font-bold text-headline">
                                            {formatNumber(stats.balance)}
                                        </span>
                                    </div>
                                </StatCard>

                                {/* Section 2: Game exchange */}
                                <StatCard title="🎮 游戏兑换统计">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-sm text-gray-600">
                                            总兑换时长
                                        </span>
                                        <span className="text-lg font-semibold text-headline">
                                            {formatDuration(
                                                stats.exchangeInfo
                                                    .totalDuration,
                                            )}
                                        </span>
                                    </div>
                                    {stats.exchangeInfo.longestDay && (
                                        <div className="flex justify-between items-baseline mt-1">
                                            <span className="text-sm text-gray-600">
                                                最长兑换日
                                            </span>
                                            <span className="text-sm font-medium text-gray-700">
                                                {formatDate(
                                                    stats.exchangeInfo
                                                        .longestDay,
                                                )}
                                                {' · '}
                                                {formatDuration(
                                                    stats.exchangeInfo
                                                        .longestDayDuration,
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </StatCard>

                                {/* Section 3: Earn & deduct (excluding exchange/advance) */}
                                <StatCard title="📊 月加减分概览（排除兑换/预支）">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-sm text-gray-600">
                                            加分类
                                        </span>
                                        <span className="text-lg font-semibold text-success">
                                            +
                                            {formatNumber(
                                                stats.monthlyEarnExcluding,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-baseline mt-1">
                                        <span className="text-sm text-gray-600">
                                            扣分类
                                        </span>
                                        <span className="text-lg font-semibold text-danger">
                                            -
                                            {formatNumber(
                                                stats.monthlyDeductExcluding,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-baseline mt-1 border-t border-gray-200 pt-1">
                                        <span className="text-sm text-gray-500">
                                            净额
                                        </span>
                                        <span
                                            className={`text-base font-semibold ${stats.monthlyEarnExcluding >= stats.monthlyDeductExcluding ? 'text-success' : 'text-danger'}`}>
                                            {stats.monthlyEarnExcluding >=
                                            stats.monthlyDeductExcluding
                                                ? '+'
                                                : ''}
                                            {formatNumber(
                                                stats.monthlyEarnExcluding -
                                                    stats.monthlyDeductExcluding,
                                            )}
                                        </span>
                                    </div>
                                </StatCard>

                                {/* Section 4: Submission vs exam */}
                                <StatCard title="📝 积分来源分析">
                                    <div className="flex justify-between items-baseline">
                                        <span className="text-sm text-gray-600">
                                            作业获得
                                        </span>
                                        <span className="text-lg font-semibold text-primary">
                                            +
                                            {formatNumber(
                                                stats.submissionEarnTotal,
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-baseline mt-1">
                                        <span className="text-sm text-gray-600">
                                            考试获得
                                        </span>
                                        <span className="text-lg font-semibold text-primary">
                                            +{formatNumber(stats.examEarnTotal)}
                                        </span>
                                    </div>
                                    <div className="mt-2 flex gap-1 h-2 rounded-full overflow-hidden bg-gray-200">
                                        <div
                                            className="bg-blue-400 transition-all"
                                            style={{
                                                width: formatRatio(
                                                    stats.submissionEarnTotal,
                                                    stats.submissionEarnTotal +
                                                        stats.examEarnTotal,
                                                ),
                                            }}
                                        />
                                        <div
                                            className="bg-purple-400 transition-all"
                                            style={{
                                                width: formatRatio(
                                                    stats.examEarnTotal,
                                                    stats.submissionEarnTotal +
                                                        stats.examEarnTotal,
                                                ),
                                            }}
                                        />
                                    </div>
                                    <div className="flex justify-between text-xs text-gray-400 mt-1">
                                        <span>
                                            作业{' '}
                                            {formatRatio(
                                                stats.submissionEarnTotal,
                                                stats.submissionEarnTotal +
                                                    stats.examEarnTotal,
                                            )}
                                        </span>
                                        <span>
                                            考试{' '}
                                            {formatRatio(
                                                stats.examEarnTotal,
                                                stats.submissionEarnTotal +
                                                    stats.examEarnTotal,
                                            )}
                                        </span>
                                    </div>
                                </StatCard>
                            </div>
                        </div>
                        <div className="flex space-x-4 justify-center">
                            <button
                                className="btn btn-primary"
                                onClick={handleDownload}>
                                下载
                            </button>
                            <button
                                className="btn btn-outline"
                                onClick={handleCopy}>
                                复制图片
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </>
    )
}
