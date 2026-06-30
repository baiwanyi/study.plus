'use client'

import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/utils/api'
import { pointColors, pointSymbol } from '@apps/utils/client'
import { parseExamData } from '@apps/pages/Options/OptionsRulesExam'
import { DataTable, type Column } from '@components/DataTable'
import type { ExamRuleRange } from '@shared/types'

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

export function WidgetExamScoreRules() {
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
