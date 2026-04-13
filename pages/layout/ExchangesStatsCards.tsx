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

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card space-y-2">
                <p className="text-sm text-muted">当前可用积分</p>
                <p
                    className={`text-4xl font-bold ${availableBalance >= minPrivilege ? 'text-primary' : 'text-danger'}`}>
                    {availableBalance}
                </p>
                {availableBalance < minPrivilege && (
                    <p className="text-xs text-danger">
                        余额不足 {minPrivilege}，兑换特权暂不可用
                    </p>
                )}
            </div>
            <div className="card space-y-2">
                <div className="flex justify-between text-xs">
                    <span>上月结余</span>
                    <span className="text-gray-700">
                        {summary?.basePoints ?? 0}
                    </span>
                </div>
                <div className="flex justify-between text-xs">
                    <span>本月扣分</span>
                    <span className="text-danger">
                        -{summary?.totalDeduct ?? 0}
                    </span>
                </div>
                <div className="flex justify-between text-xs">
                    <span>本月待结积分</span>
                    <span className="text-success">
                        +{summary?.totalEarn ?? 0}
                    </span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                    <span>总余额</span>
                    <span>{totalBalance}</span>
                </div>
                <p className="text-xs text-muted">
                    * 本月获取的积分下月1日后方可使用
                </p>
            </div>
        </div>
    )
}
