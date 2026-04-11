import { useState, useEffect } from 'react'
import { rulesApi } from '@apps/lib/api'
import type { ExchangeItemRule } from '@apps/lib/types'
import { DataTable, type Column } from '@apps/components/DataTable'
import { parseExchangeData } from '@layout/RulesExchange'

export default function WidgetExchangeRules() {
    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])

    useEffect(() => {
        let cancelled = false
        rulesApi
            .get('exchange')
            .then((data) => {
                if (!cancelled) setExchangeRules(parseExchangeData(data))
            })
            .catch(() => {
                if (!cancelled) setExchangeRules([])
            })
        return () => {
            cancelled = true
        }
    }, [])

    const columns: Column<ExchangeItemRule>[] = [
        {
            key: 'label',
            header: '项目',
            render: (rule) => (
                <span className="badge bg-indigo-100 text-indigo-800">
                    {rule.label}
                </span>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (rule) => (
                <span className="text-gray-700">{rule.points} 积分</span>
            ),
        },
        {
            key: 'ratio',
            header: '可兑换',
            render: (rule) => (
                <span className="text-gray-700">
                    {rule.ratio} {rule.unit}
                </span>
            ),
        },
        {
            key: 'rate',
            header: '比例',
            render: (rule) => (
                <span className="text-gray-500">
                    {rule.points} 积分 = {rule.ratio} {rule.unit}
                </span>
            ),
        },
    ]

    return (
        <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
                兑换规则
            </h3>
            <DataTable data={exchangeRules} columns={columns} rowKey="key" />
        </div>
    )
}
