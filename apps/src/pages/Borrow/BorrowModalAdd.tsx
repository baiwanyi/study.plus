'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@components/Modal'

interface BorrowModalAddProps {
    open: boolean
    onCancel: () => void
    onConfirm: (amount: number, installments: number) => Promise<void>
    remainingCredit: number
    maxPendingAmount: number
}

const INSTALLMENT_OPTIONS = [1, 3, 6, 9, 12] as const
const DEFAULT_BASE_RATIO = 16

function calculateRepayment(amount: number, installments: number) {
    const tierIndex = INSTALLMENT_OPTIONS.indexOf(
        installments as (typeof INSTALLMENT_OPTIONS)[number],
    )
    const ratio = DEFAULT_BASE_RATIO + tierIndex * 2
    const totalRepayment = Math.round(amount * (1 + ratio / 100))
    const installmentAmount = Math.ceil(totalRepayment / installments)
    return { ratio, totalRepayment, installmentAmount }
}

export function BorrowModalAdd({
    open,
    onCancel,
    onConfirm,
    remainingCredit,
    maxPendingAmount,
}: BorrowModalAddProps) {
    const [amount, setAmount] = useState('')
    const [installments, setInstallments] =
        useState<(typeof INSTALLMENT_OPTIONS)[number]>(1)
    const [creating, setCreating] = useState(false)

    useEffect(() => {
        if (open) {
            setAmount('')
            setInstallments(1)
        }
    }, [open])

    const numAmount = Number(amount)
    const isValidAmount =
        Number.isInteger(numAmount) && numAmount > 0 && amount !== ''
    const calc = isValidAmount
        ? calculateRepayment(numAmount, installments)
        : null

    const exceedsCredit = calc !== null && calc.totalRepayment > remainingCredit

    const handleCreate = async () => {
        if (!calc || !isValidAmount) return
        setCreating(true)
        try {
            await onConfirm(numAmount, installments)
            setAmount('')
        } finally {
            setCreating(false)
        }
    }

    const handleClose = () => {
        onCancel()
        setAmount('')
    }

    const isDisabled = creating || !isValidAmount || exceedsCredit

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            onConfirm={handleCreate}
            isDisabled={isDisabled}
            isLoading={creating}
            title="积分预支"
            confirmLabel="确认预支">
            <div className="space-y-4">
                <div className="space-y-2">
                    <label className="label">预支积分</label>
                    <input
                        className="regular-text"
                        type="number"
                        min="1"
                        step="1"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="请输入预支积分"
                    />
                </div>

                <div className="space-y-2">
                    <label className="label">归还期数</label>
                    <select
                        className="regular-text"
                        value={installments}
                        onChange={(e) =>
                            setInstallments(
                                Number(
                                    e.target.value,
                                ) as (typeof INSTALLMENT_OPTIONS)[number],
                            )
                        }>
                        {INSTALLMENT_OPTIONS.map((n) => (
                            <option key={n} value={n}>
                                {n} 期
                            </option>
                        ))}
                    </select>
                </div>

                {calc && (
                    <div className="space-y-2 bg-gray-50 rounded-lg p-3 text-sm">
                        <div className="flex justify-between">
                            <span className="text-gray-500">返还比例</span>
                            <span className="font-medium text-gray-800">
                                {calc.ratio}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">应还总额</span>
                            <span className="font-medium text-gray-800">
                                {calc.totalRepayment} 积分
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-gray-500">每期应还</span>
                            <span className="font-medium text-gray-800">
                                {calc.installmentAmount} 积分 × {installments}{' '}
                                期
                            </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-200">
                            <span className="text-gray-500">
                                剩余可预支额度
                            </span>
                            <span className="font-medium text-gray-800">
                                {remainingCredit} 积分
                            </span>
                        </div>
                    </div>
                )}

                {exceedsCredit && (
                    <div className="bg-danger-background rounded-lg p-3 text-sm text-danger">
                        预支总额 {calc!.totalRepayment} 积分超出剩余额度{' '}
                        {remainingCredit} 积分（上限 {maxPendingAmount} 积分）
                    </div>
                )}
            </div>
        </Modal>
    )
}
