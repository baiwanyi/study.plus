import type { MonthSummary } from '@apps/lib/types'

interface WidgetBalanceProps {
    summary: MonthSummary | null
    month: string
}

export default function WidgetBalance({ summary, month }: WidgetBalanceProps) {
    const availableBalance = summary?.availableBalance ?? 0
    const balance = summary?.balance ?? 0
    const minimumPoints = summary?.minimumPointsForPrivileges ?? 0
    const totalEarn = summary?.totalEarn ?? 0

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
                <p className="text-sm text-gray-500">可用积分 ({month})</p>
                <p
                    className={`text-4xl font-bold mt-2 ${availableBalance >= minimumPoints ? 'text-indigo-600' : 'text-red-600'}`}>
                    {availableBalance.toLocaleString()}
                </p>
                {availableBalance < minimumPoints && (
                    <p className="text-xs text-red-500 mt-1">
                        余额不足 {minimumPoints} 积分，兑换特权暂不可用。
                    </p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                    * 本月获取积分下月方可使用
                </p>
            </div>
            <div className="card">
                <p className="text-sm text-gray-500">总余额 ({month})</p>
                <p
                    className={`text-4xl font-bold mt-2 ${balance >= minimumPoints ? 'text-emerald-600' : 'text-red-600'}`}>
                    {balance.toLocaleString()}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                    含本月待结积分 +{totalEarn.toLocaleString()}
                </p>
            </div>
        </div>
    )
}
