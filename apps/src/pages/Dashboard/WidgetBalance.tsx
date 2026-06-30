'use client'

import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/utils/api'
import { parseExchangeData } from '@apps/pages/Options/OptionsRulesExchange'
import type { MonthSummary, ExchangeItemRule } from '@shared/types'

const DEFAULT_RATIO = 5
const DEFAULT_POINTS = 1

interface WidgetBalanceProps {
    summary: MonthSummary | null
    month: string
}

export function WidgetBalance({ summary, month }: WidgetBalanceProps) {
    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])

    useEffect(() => {
        let cancelled = false
        optionsAPI
            .get('exchange')
            .then((data) => {
                if (!cancelled) setExchangeRules(parseExchangeData(data))
            })
            .catch(() => {
                if (!cancelled) setExchangeRules([])
            })
        return () => {
            cancelled = true
        }
    }, [])

    const availableBalance = summary?.availableBalance ?? 0
    const balance = summary?.balance ?? 0
    const totalExchanges = summary?.totalExchanges ?? 0
    const minimumPoints = summary?.minimumPointsForPrivileges ?? 0
    const totalEarn = summary?.totalEarn ?? 0
    const totalDeduct = summary?.totalDeduct ?? 0
    const monthlyBasePoints = summary?.monthlyBasePoints ?? 0

    const gameRule = exchangeRules.find(
        (r) => r.key === 'game' || r.label.includes('游戏'),
    )
    const points = gameRule ? gameRule.points : DEFAULT_POINTS
    const ratio = gameRule ? gameRule.ratio : DEFAULT_RATIO
    const exchangeableMinutes = Math.round((availableBalance / points) * ratio)

    return (
        <div className="grid grid-cols-1 gap-4">
            <div className="card space-y-2">
                <p className="text-sm text-gray-700">可用积分 ({month})</p>
                <p
                    className={`text-4xl font-bold ${availableBalance >= minimumPoints ? 'text-primary' : 'text-danger'}`}>
                    {availableBalance.toLocaleString()}
                </p>
                {availableBalance < minimumPoints && (
                    <p className="text-xs text-danger">
                        余额不足 {minimumPoints} 积分，兑换特权暂不可用。
                    </p>
                )}
                <p className="text-xs text-muted">
                    剩余积分可兑换游戏时长约
                    <span className="font-semibold px-1">
                        {exchangeableMinutes}
                    </span>
                    分
                </p>
            </div>
            <div className="card space-y-2">
                <p className="text-sm text-gray-700">总余额</p>
                <p
                    className={`text-4xl font-bold ${balance >= minimumPoints ? 'text-primary' : 'text-danger'}`}>
                    {balance.toLocaleString()}
                </p>
            </div>
            <div className="card space-y-2">
                <p className="text-sm text-gray-700">下月可用积分</p>
                <p className="text-4xl font-bold text-primary">
                    {(
                        Math.abs(monthlyBasePoints + totalEarn) -
                        Math.abs(totalDeduct - totalExchanges)
                    ).toLocaleString()}
                </p>

                <p className="text-xs text-muted">
                    * 本月获取积分及月初始积分下月方可使用
                </p>
            </div>
        </div>
    )
}
