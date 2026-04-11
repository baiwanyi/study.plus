import { useState, useEffect } from 'react'
import { rulesApi } from '@apps/lib/api'
import type { ExamRuleRange } from '@apps/lib/types'
import { parseExamData } from '@layout/RulesExam'
import { DataTable, type Column } from '@apps/components/DataTable'

const columns: Column<ExamRuleRange>[] = [
    {
        key: 'range',
        header: '分数区间',
        render: (rule) => (
            <span className="text-gray-700">
                {rule.min} ~ {rule.max} 分
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

export default function WidgetExamScoreRules() {
    const [examRules, setExamRules] = useState<ExamRuleRange[]>([])

    useEffect(() => {
        rulesApi
            .get('exam')
            .then((data) => {
                setExamRules(parseExamData(data))
            })
            .catch(() => {
                setExamRules([])
            })
    }, [])

    return (
        <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                单元测评积分
            </h3>
            <DataTable
                data={examRules}
                columns={columns}
                rowKey={(_, i) => String(i)}
            />
        </div>
    )
}
