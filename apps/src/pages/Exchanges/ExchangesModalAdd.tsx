'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@components/Modal'
import type { ExchangeItemRule } from '@shared/types'

interface ExchangesModalAddProps {
    open: boolean
    onCancel: () => void
    onConfirm: (itemType: string, pointsCost: number) => Promise<void>
    exchangeRules: ExchangeItemRule[]
    availableBalance: number
}

export function ExchangesModalAdd({
    open,
    onCancel,
    onConfirm,
    exchangeRules,
    availableBalance,
}: ExchangesModalAddProps) {
    const [itemType, setItemType] = useState<string>(
        exchangeRules[0]?.key ?? '',
    )
    const [exchangeQuantity, setExchangeQuantity] = useState('')
    const [creating, setCreating] = useState(false)

    // 模态框打开时重置为默认选项
    useEffect(() => {
        if (open) {
            setItemType('')
            setExchangeQuantity('')
        }
    }, [open, exchangeRules])

    const currentRule = exchangeRules.find((r) => r.key === itemType)

    const calculatedPointsCost = (() => {
        const qty = Number(exchangeQuantity)
        if (!qty || qty <= 0 || !currentRule) return 0
        return Math.ceil((qty / currentRule.ratio) * currentRule.points)
    })()

    const handleCreate = async () => {
        if (calculatedPointsCost <= 0) return
        setCreating(true)
        try {
            await onConfirm(itemType, calculatedPointsCost)
            setExchangeQuantity('')
        } finally {
            setCreating(false)
        }
    }

    const handleClose = () => {
        onCancel()
        setExchangeQuantity('')
    }

    const isDisabled =
        creating ||
        calculatedPointsCost <= 0 ||
        calculatedPointsCost > availableBalance

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            onConfirm={handleCreate}
            isDisabled={isDisabled}
            isLoading={creating}
            title="添加兑换记录"
            confirmLabel="确认兑换">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="label">兑换项目</label>
                    <select
                        className="regular-text"
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
                    <div className="bg-info-background rounded-lg p-3 text-sm text-info">
                        兑换比例：{currentRule.points} 积分 ={' '}
                        {currentRule.ratio} {currentRule.unit}
                    </div>
                )}
                <div className="space-y-2">
                    <label className="label">
                        兑换{currentRule?.unit ?? '数量'}
                    </label>
                    <input
                        className="regular-text"
                        type="number"
                        min="1"
                        value={exchangeQuantity}
                        onChange={(e) => setExchangeQuantity(e.target.value)}
                        placeholder={`请输入${currentRule?.unit ?? '数量'}`}
                    />
                </div>
                {calculatedPointsCost > 0 && (
                    <div className="bg-info-background rounded-lg p-3 text-sm text-info">
                        需消耗：<strong>{calculatedPointsCost}</strong> 积分
                        {calculatedPointsCost > availableBalance && (
                            <span className="text-danger ml-2">
                                （积分不足）
                            </span>
                        )}
                    </div>
                )}
            </div>
        </Modal>
    )
}
