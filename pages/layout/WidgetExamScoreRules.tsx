import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/lib/api'
import type { ExamRuleRange } from '@apps/lib/types'
import { pointColors, pointSymbol } from '@apps/lib/utils'
import { parseExamData } from '@/pages/layout/OptionsRulesExam'
import { DataTable, type Column } from '@apps/components/DataTable'

const columns: Column<ExamRuleRange>[] = [
    {
        key: 'range',
        header: '分数区间',
        render: (rule) => (
            <span className="text-heading">
                {rule.min} ~ {rule.max} 分
            </span>
        ),
    },
    {
        key: 'points',
        header: '积分',
        render: (rule) => {
            const type = rule.points >= 0 ? 'earn' : 'deduct'
            return (
                <span className={pointColors[type]}>
                    {pointSymbol[type]}
                    {Math.abs(rule.points)}
                </span>
            )
        },
    },
]

export default function WidgetExamScoreRules() {
    const [examRules, setExamRules] = useState<ExamRuleRange[]>([])

    useEffect(() => {
        optionsAPI
            .get('exam')
            .then((data) => {
                setExamRules(parseExamData(data))
            })
            .catch(() => {
                setExamRules([])
            })
    }, [])

    return (
        <div className="card space-y-4">
            <h3>单元测评积分规则</h3>
            <DataTable
                data={examRules}
                columns={columns}
                rowKey={(_, i) => String(i)}
            />
        </div>
    )
}
