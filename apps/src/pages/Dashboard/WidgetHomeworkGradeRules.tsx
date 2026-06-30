'use client'

import { useState, useEffect } from 'react'
import { parseHomeworkData } from '@apps/pages/Options/OptionsRulesHomework'
import { optionsAPI } from '@apps/utils/api'
import { pointColors, pointSymbol } from '@apps/utils/client'
import { DataTable, type Column } from '@components/DataTable'
import type { HomeworkGradeRule } from '@shared/types'

export function WidgetHomeworkGradeRules() {
    const [homeworkRules, setHomeworkRules] = useState<HomeworkGradeRule[]>([])

    useEffect(() => {
        optionsAPI
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
                <span className="badge-primary">{rule.grade}</span>
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

    return (
        <div className="card space-y-4">
            <h3>作业评分积分规则</h3>
            <DataTable data={homeworkRules} columns={columns} rowKey="grade" />
        </div>
    )
}
