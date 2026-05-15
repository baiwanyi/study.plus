import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/lib/api'
import { defaultExchangeRuleRemarks } from '@apps/lib/default'
import type { ExchangeItemRule } from '@apps/lib/types'
import { DataTable, type Column } from '@apps/components/DataTable'
import { parseExchangeData } from '@pages/layout/OptionsRulesExchange'

export default function WidgetExchangeRules() {
    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])
    const [timeRules, setTimeRules] = useState<string[]>(defaultExchangeRuleRemarks)

    useEffect(() => {
        let cancelled = false
        optionsAPI
            .get('exchange')
            .then((data) => {
                if (!cancelled) setExchangeRules(parseExchangeData(data))
            })
            .catch(() => {
                if (!cancelled) setExchangeRules([])
            })

        optionsAPI
            .get('exchangeRuleRemarks')
            .then((data) => {
                if (cancelled) return
                if (Array.isArray(data)) {
                    setTimeRules(data as string[])
                }
            })
            .catch(() => {})
        return () => {
            cancelled = true
        }
    }, [])

    const columns: Column<ExchangeItemRule>[] = [
        {
            key: 'label',
            header: '项目',
            render: (rule) => (
                <span className="badge-primary">{rule.label}</span>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (rule) => (
                <span className="text-heading">{rule.points} 积分</span>
            ),
        },
        {
            key: 'ratio',
            header: '可兑换',
            render: (rule) => (
                <span className="text-heading font-semibold text-danger">
                    {rule.ratio} {rule.unit}
                </span>
            ),
        },
    ]

    return (
        <div className="card space-y-4">
            <h3>积分兑换规则</h3>
            <DataTable data={exchangeRules} columns={columns} rowKey="key" />
            <ul className="text-muted text-sm">
                {timeRules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                ))}
            </ul>
        </div>
    )
}
