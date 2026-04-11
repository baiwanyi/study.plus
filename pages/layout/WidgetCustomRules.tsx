import { useState, useEffect } from 'react'
import { rulesApi } from '@apps/lib/api'
import type { CustomRule } from '@apps/lib/types'
import { parseCustomData } from '@layout/RulesCustom'
import { DataTable, type Column } from '@apps/components/DataTable'

export default function WidgetCustomRules() {
    const [customRules, setCustomRules] = useState<CustomRule[]>([])

    useEffect(() => {
        rulesApi
            .get('custom')
            .then((data) => {
                setCustomRules(parseCustomData(data))
            })
            .catch(() => {
                setCustomRules([])
            })
    }, [])

    const columns: Column<CustomRule>[] = [
        {
            key: 'name',
            header: '名称',
            render: (rule) => (
                <span className="font-medium text-gray-900">{rule.name}</span>
            ),
        },
        {
            key: 'type',
            header: '类型',
            render: (rule) => (
                <span
                    className={`badge ${rule.type === 'earn' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                    {rule.type === 'earn' ? '加分' : '扣分'}
                </span>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (rule) => (
                <span
                    className={`font-medium ${rule.type === 'earn' ? 'text-emerald-600' : 'text-red-600'}`}>
                    {rule.type === 'earn' ? '+' : '-'}
                    {rule.points}
                </span>
            ),
        },
        {
            key: 'description',
            header: '说明',
            render: (rule) => (
                <span className="text-gray-500">{rule.description}</span>
            ),
        },
    ]

    return (
        <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                自定义规则
            </h3>
            <DataTable
                data={customRules}
                columns={columns}
                rowKey={(rule, idx) => rule.name || rule.id || `custom-${idx}`}
            />
        </div>
    )
}
