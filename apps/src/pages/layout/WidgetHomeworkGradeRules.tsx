import { useState, useEffect } from 'react'
import { optionsAPI } from '@/api'
import type { HomeworkGradeRule } from '@shared/types'
import { parseHomeworkData } from '@/pages/layout/OptionsRulesHomework'
import { DataTable, type Column } from '@/components/DataTable'
import { pointColors, pointSymbol } from '@/utils'
export default function WidgetHomeworkGradeRules() {    const [homeworkRules, setHomeworkRules] = useState<HomeworkGradeRule[]>([])    useEffect(() => {        optionsAPI            .get('homework')            .then((data) => {                setHomeworkRules(parseHomeworkData(data))            })            .catch(() => {                setHomeworkRules([])            })    }, [])    const columns: Column<HomeworkGradeRule>[] = [        {            key: 'grade',            header: '等级',            render: (rule) => (                <span className="badge-primary">{rule.grade}
</span>            ),        },        {            key: 'points',            header: '积分',            render: (rule) => {                const type = rule.points >= 0 ? 'earn' : 'deduct'                return (                    <span className={pointColors[type]}>                        {pointSymbol[type]}                        {Math.abs(rule.points)}
</span>                )            },        },    ]    return (        <div className="card space-y-4">            <h3>作业评分积分规则</h3>            <DataTable data={homeworkRules} columns={columns} rowKey="grade" />        </div>    )}