import { useMemo } from 'react'
import type { PointStats, Task } from '@apps/lib/types'

interface WidgetStatsProps {
    stats: PointStats | null
    pendingTasks: Task[]
    totalTasks: Task[]
}

export default function WidgetStats({
    stats,
    pendingTasks,
    totalTasks,
}: WidgetStatsProps) {
    const statCards = useMemo(
        () => [
            {
                label: '本月积分',
                value: stats?.totalEarn ?? 0,
                color: 'text-success'
            },
            {
                label: '本月兑换',
                value: stats?.totalExchanges ?? 0,
                color: 'text-warning',
            },
            {
                label: '待完成作业',
                value: pendingTasks.length,
                color: 'text-danger',
            },
            {
                label: '总作业数',
                value: totalTasks.length,
                color: 'text-primary',
            },
        ],
        [stats, pendingTasks.length, totalTasks.length],
    )

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
                <div key={card.label} className="card">
                    <p className="text-sm text-gray-500">{card.label}</p>
                    <p className={`text-3xl font-bold mt-1 ${card.color}`}>
                        {card.value}
                    </p>
                </div>
            ))}
        </div>
    )
}
