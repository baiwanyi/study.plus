import { useState, useEffect, useCallback } from 'react'
import { exchangesApi, pointsApi, rulesApi } from '../lib/api'
import type { Exchange, MonthSummary, ExchangeItemRule } from '../lib/types'
import { formatDate, exchangeStatusLabels } from '../lib/utils'
import { useSnackbar, ConfirmModal } from '../components/Snackbar'
import { X } from 'lucide-react'

const PAGE_SIZE = 20

export default function Exchanges() {
    const { showSnackbar } = useSnackbar()
    const [exchanges, setExchanges] = useState<Exchange[]>([])
    const [summary, setSummary] = useState<MonthSummary | null>(null)
    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])
    const [loading, setLoading] = useState(true)
    const [showCreate, setShowCreate] = useState(false)
    const [creating, setCreating] = useState(false)
    const [revokeId, setRevokeId] = useState<number | null>(null)
    const [page, setPage] = useState(1)

    // Create form
    const [itemType, setItemType] = useState<string>('tv')
    const [exchangeQuantity, setExchangeQuantity] = useState('')

    const loadData = useCallback(async () => {
        try {
            const [exchangesData, summaryData, exchangeRulesData] =
                await Promise.all([
                    exchangesApi.list(),
                    pointsApi.summary(),
                    rulesApi.get('exchange').catch(() => null),
                ])
            setExchanges(exchangesData)
            setSummary(summaryData)
            // Parse exchange rules from rules config
            if (exchangeRulesData) {
                const exSrc = exchangeRulesData as unknown
                if (Array.isArray(exSrc)) {
                    setExchangeRules(
                        (exSrc as Record<string, unknown>[]).map((item) => {
                            const ratio =
                                item.ratio !== undefined
                                    ? Number(item.ratio)
                                    : item.minutes !== undefined
                                      ? Number(item.minutes)
                                      : item.yuan !== undefined
                                        ? Number(item.yuan)
                                        : 1
                            const unit =
                                item.unit !== undefined
                                    ? String(item.unit)
                                    : item.minutes !== undefined
                                      ? '分钟'
                                      : item.yuan !== undefined
                                        ? '元'
                                        : '次'
                            return {
                                key: String(item.key ?? ''),
                                label: String(item.label ?? ''),
                                points: Number(item.points ?? 1),
                                ratio,
                                unit,
                            } as ExchangeItemRule
                        }),
                    )
                } else if (exSrc && typeof exSrc === 'object') {
                    // Convert old object format to array
                    const converted = Object.entries(
                        exSrc as Record<string, unknown>,
                    ).map(([key, val]) => {
                        const item = val as Record<string, unknown>
                        // Already has ratio/unit
                        if (item.ratio !== undefined) {
                            return {
                                key,
                                label: (item.label as string) ?? key,
                                points: Number(item.points ?? 1),
                                ratio: Number(item.ratio),
                                unit: (item.unit as string) ?? '次',
                            } as ExchangeItemRule
                        }
                        // Old format: convert minutes/yuan to ratio+unit
                        const minutes =
                            item.minutes != null
                                ? Number(item.minutes)
                                : undefined
                        const yuan =
                            item.yuan != null ? Number(item.yuan) : undefined
                        if (minutes !== undefined) {
                            return {
                                key,
                                label: (item.label as string) ?? key,
                                points: Number(item.points ?? 1),
                                ratio: minutes,
                                unit: '分钟',
                            } as ExchangeItemRule
                        }
                        if (yuan !== undefined) {
                            return {
                                key,
                                label: (item.label as string) ?? key,
                                points: Number(item.points ?? 1),
                                ratio: yuan,
                                unit: '元',
                            } as ExchangeItemRule
                        }
                        return {
                            key,
                            label: (item.label as string) ?? key,
                            points: Number(item.points ?? 1),
                            ratio: 1,
                            unit: '次',
                        } as ExchangeItemRule
                    })
                    setExchangeRules(converted)
                }
            }
        } catch (err) {
            console.error('Failed to load exchanges:', err)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadData()
    }, [loadData])

    const availableBalance = summary?.availableBalance ?? 0
    const totalBalance = summary?.balance ?? 0
    const minPrivilege = summary?.minimumPointsForPrivileges ?? 500

    const getRuleByKey = (key: string): ExchangeItemRule | undefined =>
        exchangeRules.find((r) => r.key === key)

    const getItemLabel = (key: string): string =>
        getRuleByKey(key)?.label ?? key

    const currentRule = getRuleByKey(itemType)
    // Calculate points cost from quantity
    const calculatedPointsCost = (() => {
        const qty = Number(exchangeQuantity)
        if (!qty || qty <= 0 || !currentRule) return 0
        return Math.ceil((qty / currentRule.ratio) * currentRule.points)
    })()

    const getExchangeDetail = (key: string, cost: number): string => {
        const rate = getRuleByKey(key)
        if (!rate) return ''
        const quantity = (cost / rate.points) * rate.ratio
        return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(1)} ${rate.unit}`
    }

    const handleCreate = async () => {
        if (calculatedPointsCost <= 0) return
        setCreating(true)
        try {
            await exchangesApi.create({
                itemType,
                pointsCost: calculatedPointsCost,
            })
            setShowCreate(false)
            setExchangeQuantity('')
            showSnackbar('兑换成功')
            loadData()
        } catch (err) {
            showSnackbar(
                '兑换失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setCreating(false)
        }
    }

    const handleRevoke = async (id: number) => {
        setRevokeId(id)
    }

    const confirmRevoke = async () => {
        if (revokeId === null) return
        try {
            await exchangesApi.revoke(revokeId)
            showSnackbar('撤销成功')
            loadData()
        } catch (err) {
            showSnackbar(
                '撤销失败: ' +
                    (err instanceof Error ? err.message : '未知错误'),
                'error',
            )
        } finally {
            setRevokeId(null)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-400">加载中...</div>
            </div>
        )
    }

    const totalPages = Math.max(1, Math.ceil(exchanges.length / PAGE_SIZE))
    const pagedExchanges = exchanges.slice(
        (page - 1) * PAGE_SIZE,
        page * PAGE_SIZE,
    )

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">
                        兑换记录
                    </h2>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn-primary">
                        添加兑换
                    </button>
                </div>

                {/* Balance */}
                <div className="card">
                    <p className="text-sm text-gray-500">当前可用积分</p>
                    <p
                        className={`text-4xl font-bold mt-1 ${availableBalance >= minPrivilege ? 'text-indigo-600' : 'text-red-600'}`}>
                        {availableBalance}
                    </p>
                    {availableBalance < minPrivilege && (
                        <p className="text-xs text-red-500 mt-2">
                            余额不足{minPrivilege}，电视/设备特权暂不可用
                        </p>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>上月结余</span>
                            <span className="text-gray-700">
                                {summary?.basePoints ?? 0}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>本月扣分</span>
                            <span className="text-red-600">
                                -{summary?.totalDeduct ?? 0}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-500">
                            <span>本月待结积分</span>
                            <span className="text-emerald-600">
                                +{summary?.totalEarn ?? 0}
                            </span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
                            <span>总余额</span>
                            <span>{totalBalance}</span>
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                        * 本月获取的积分下月1日后方可使用
                    </p>
                </div>

                {/* Exchange Records Table */}
                <div className="card overflow-hidden !p-0">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    时间
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    项目
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    消耗积分
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    兑换内容
                                </th>
                                <th className="text-left py-3 px-4 text-gray-500 font-medium">
                                    状态
                                </th>
                                <th className="text-right py-3 px-4 text-gray-500 font-medium">
                                    操作
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {exchanges.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={6}
                                        className="py-8 text-center text-gray-400">
                                        暂无兑换记录
                                    </td>
                                </tr>
                            ) : (
                                pagedExchanges.map((exchange) => (
                                    <tr
                                        key={exchange.id}
                                        className="border-b border-gray-50 hover:bg-gray-50">
                                        <td className="py-3 px-4 text-gray-600">
                                            {formatDate(exchange.createdAt)}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className="badge bg-indigo-100 text-indigo-800">
                                                {getItemLabel(
                                                    exchange.itemType,
                                                )}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-red-600 font-medium">
                                            -{exchange.pointsCost}
                                        </td>
                                        <td className="py-3 px-4 text-gray-700">
                                            {exchange.detail ??
                                                getExchangeDetail(
                                                    exchange.itemType,
                                                    exchange.pointsCost,
                                                )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className={`badge-${exchange.status}`}>
                                                {
                                                    exchangeStatusLabels[
                                                        exchange.status
                                                    ]
                                                }
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            {exchange.status === 'active' && (
                                                <button
                                                    onClick={() =>
                                                        handleRevoke(
                                                            exchange.id,
                                                        )
                                                    }
                                                    className="btn-danger btn-sm">
                                                    撤销
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                    {exchanges.length > PAGE_SIZE && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                            <p className="text-sm text-gray-500">
                                共 {exchanges.length} 条，第 {page}/{totalPages}{' '}
                                页
                            </p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={page <= 1}
                                    className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                    上一页
                                </button>
                                <button
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(totalPages, p + 1),
                                        )
                                    }
                                    disabled={page >= totalPages}
                                    className="px-3 py-1 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                    下一页
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showCreate && (
                <Modal
                    onClose={() => {
                        setShowCreate(false)
                        setExchangeQuantity('')
                    }}
                    title="添加兑换记录">
                    <div className="space-y-4">
                        <div>
                            <label className="label">兑换项目</label>
                            <select
                                className="input"
                                value={itemType}
                                onChange={(e) => {
                                    setItemType(e.target.value)
                                    setExchangeQuantity('')
                                }}>
                                <option value="">请选择项目</option>
                                {exchangeRules.map((rule) => (
                                    <option key={rule.key} value={rule.key}>
                                        {rule.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {currentRule && (
                            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
                                兑换比例：{currentRule.points} 积分 ={' '}
                                {currentRule.ratio} {currentRule.unit}
                            </div>
                        )}
                        <div>
                            <label className="label">
                                兑换{currentRule?.unit ?? '数量'}
                            </label>
                            <input
                                className="input"
                                type="number"
                                min="1"
                                value={exchangeQuantity}
                                onChange={(e) =>
                                    setExchangeQuantity(e.target.value)
                                }
                                placeholder={`请输入${currentRule?.unit ?? '数量'}`}
                            />
                        </div>
                        {calculatedPointsCost > 0 && (
                            <div className="bg-indigo-50 rounded-lg p-3">
                                <p className="text-sm text-indigo-700">
                                    需消耗：
                                    <strong>{calculatedPointsCost}</strong> 积分
                                    {calculatedPointsCost >
                                        availableBalance && (
                                        <span className="text-red-500 ml-2">
                                            （积分不足）
                                        </span>
                                    )}
                                </p>
                            </div>
                        )}
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => {
                                    setShowCreate(false)
                                    setExchangeQuantity('')
                                }}
                                className="btn-outline">
                                取消
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={
                                    creating ||
                                    calculatedPointsCost <= 0 ||
                                    calculatedPointsCost > availableBalance
                                }
                                className="btn-primary">
                                {creating ? '兑换中...' : '确认兑换'}
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            <ConfirmModal
                open={revokeId !== null}
                title="撤销兑换"
                message="确定撤销此兑换？积分将退回。"
                confirmLabel="撤销"
                danger
                onConfirm={confirmRevoke}
                onCancel={() => setRevokeId(null)}
            />
        </>
    )
}

function Modal({
    children,
    onClose,
    title,
}: {
    children: React.ReactNode
    onClose: () => void
    title: string
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
                <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                            {title}
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    )
}
