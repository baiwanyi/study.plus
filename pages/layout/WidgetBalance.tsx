import type { MonthSummary } from '@apps/lib/types'

interface WidgetBalanceProps {
    summary: MonthSummary | null
    month: string
}

export default function WidgetBalance({ summary, month }: WidgetBalanceProps) {
    const availableBalance = summary?.availableBalance ?? 0
    const balance = summary?.balance ?? 0
    const totalExchanges = summary?.totalExchanges ?? 0
    const minimumPoints = summary?.minimumPointsForPrivileges ?? 0
    const totalEarn = summary?.totalEarn ?? 0
    const totalDeduct = summary?.totalDeduct ?? 0
    const monthlyBasePoints = summary?.monthlyBasePoints ?? 0

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
                        monthlyBasePoints -
                        Math.abs(totalEarn - totalDeduct + totalExchanges)
                    ).toLocaleString()}
                </p>

                <p className="text-xs text-muted">
                    * 本月获取积分及月初始积分下月方可使用
                </p>
            </div>
        </div>
    )
}
