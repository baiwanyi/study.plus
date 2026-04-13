import type { PointStats } from '@apps/lib/types'

interface PointsStatsCardsProps {
    stats: PointStats | null
}

export default function PointsStatsCards({ stats }: PointsStatsCardsProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
                <p className="text-sm text-gray-500">本月积分</p>
                <p className="text-3xl font-bold text-primary">
                    {stats?.totalEarn ?? 0}
                </p>
            </div>
            <div className="card">
                <p className="text-sm text-gray-500">本月兑换</p>
                <p className="text-3xl font-bold text-primary">
                    {stats?.totalExchanges ?? 0}
                </p>
            </div>
        </div>
    )
}
