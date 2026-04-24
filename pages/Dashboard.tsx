import { useState, useEffect, useMemo } from 'react'
import { tasksApi, pointsApi } from '@apps/lib/api'
import type { Task, PointStats, MonthSummary } from '@apps/lib/types'
import { getCurrentMonth } from '@apps/lib/utils'
import Loading from '@apps/components/Loading'
import WidgetStats from '@layout/WidgetStats'
import WidgetBalance from '@layout/WidgetBalance'
import WidgetCustomRules from '@layout/WidgetCustomRules'
import WidgetExamScoreRules from '@layout/WidgetExamScoreRules'
import WidgetHomeworkGradeRules from '@layout/WidgetHomeworkGradeRules'
import WidgetExchangeRules from '@layout/WidgetExchangeRules'
import WidgetPendingTasks from '@layout/WidgetPendingTasks'
import Help from '@layout/Help'
import Share from '@layout/Share'

export default function Dashboard() {
    const [tasks, setTasks] = useState<Task[]>([])
    const [stats, setStats] = useState<PointStats | null>(null)
    const [summary, setSummary] = useState<MonthSummary | null>(null)
    const [loading, setLoading] = useState(true)

    const loadData = async () => {
        try {
            const [tasksData, statsData, summaryData] = await Promise.all([
                tasksApi.list().catch(() => null),
                pointsApi.stats().catch(() => null),
                pointsApi.summary().catch(() => null),
            ])
            setTasks(tasksData ?? [])
            setStats(statsData ?? null)
            setSummary(summaryData ?? null)
        } catch (err) {
            console.error('Failed to load dashboard:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadData()
    }, [])

    const pendingTasks = useMemo(
        () => tasks.filter((t) => t.status === 'pending'),
        [tasks],
    )
    const month = getCurrentMonth()

    if (loading) {
        return <Loading />
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">首页看板</h2>
                <div className="flex items-center space-x-4">
                    <Help />
                    <Share />
                </div>
            </div>

            {/* Stats Cards */}
            <WidgetStats
                stats={stats}
                pendingTasks={pendingTasks}
                totalTasks={tasks}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Net Change & Balance */}
                <WidgetBalance summary={summary} month={month} />
                {/* Pending Tasks */}
                <WidgetPendingTasks pendingTasks={pendingTasks} />
            </div>

            {/* All Rules List */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Exam Score Rules */}
                <WidgetExamScoreRules />

                {/* Homework Grade Rules */}
                <WidgetHomeworkGradeRules />

                {/* Exchange Rules */}
                <WidgetExchangeRules />
            </div>

            {/* Custom Rules */}
            <WidgetCustomRules />
        </div>
    )
}
