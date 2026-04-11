import { useState, useEffect } from 'react'
import { rulesApi } from '@apps/lib/api'
import type { HomeworkGradeRule } from '@apps/lib/types'
import { parseHomeworkData } from '@layout/RulesHomework'
import { DataTable, type Column } from '@apps/components/DataTable'

export default function WidgetHomeworkGradeRules() {
    const [homeworkRules, setHomeworkRules] = useState<HomeworkGradeRule[]>([])

    useEffect(() => {
        rulesApi
            .get('homework')
            .then((data) => {
                setHomeworkRules(parseHomeworkData(data))
            })
            .catch(() => {
                setHomeworkRules([])
            })
    }, [])

    const columns: Column<HomeworkGradeRule>[] = [
        {
            key: 'grade',
            header: '等级',
            render: (rule) => (
                <span className="badge bg-purple-100 text-purple-800">
                    {rule.grade}
                </span>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (rule) => (
                <span
                    className={`font-medium ${rule.points >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {rule.points >= 0 ? '+' : ''}
                    {rule.points}
                </span>
            ),
        },
    ]

    return (
        <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                作业评分积分
            </h3>
            <DataTable data={homeworkRules} columns={columns} rowKey="grade" />
        </div>
    )
}
