import { useMemo } from 'react'
import type { MonthSummary } from '@apps/lib/types'

interface ExchangesStatsCardsProps {
    summary: MonthSummary | null
}

export default function ExchangesStatsCards({
    summary,
}: ExchangesStatsCardsProps) {
    const availableBalance = summary?.availableBalance ?? 0
    const totalBalance = summary?.balance ?? 0
    const minPrivilege = summary?.minimumPointsForPrivileges ?? 100
    const exchangesCards = useMemo(
        () => [
            {
                label: '当前可用积分',
                value: availableBalance ?? 0,
                color:
                    availableBalance >= minPrivilege
                        ? 'text-primary'
                        : 'text-danger',
            },
            {
                label: '本月消耗积分（含扣分）',
                value: summary?.totalDeduct ?? 0,
                color: 'text-danger',
            },
            {
                label: '本月待结积分',
                value: summary?.totalEarn ?? 0,
                color: 'text-success',
            },
            {
                label: '本月基础积分',
                value: summary?.basePoints ?? 0,
                color: 'text-gray-700',
            },
        ],
        [availableBalance, minPrivilege, summary],
    )
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {exchangesCards.map((card, i) => (
                <div key={i} className="card space-y-2">
                    <p className="text-sm text-muted">{card.label}</p>
                    <p className={`text-4xl font-bold ${card.color}`}>
                        {card.value}
                    </p>
                    {i === 0 && (
                        <p className="text-sm">总积分 {totalBalance}</p>
                    )}
                    {i === 0 && (
                        <p className="text-xs text-muted">
                            * 本月获取的积分及月初始积分下月1日后方可使用
                        </p>
                    )}
                    {i === 0 && availableBalance < minPrivilege && (
                        <p className="text-xs text-danger">
                            积分不足 {minPrivilege}，兑换特权暂不可用。
                        </p>
                    )}
                </div>
            ))}
        </div>
    )
}
