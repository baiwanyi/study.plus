import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/lib/api'
import type { ExchangeItemRule } from '@apps/lib/types'
import { DataTable, type Column } from '@apps/components/DataTable'
import { parseExchangeData } from '@pages/layout/OptionsRulesExchange'

export default function WidgetExchangeRules() {
    const [exchangeRules, setExchangeRules] = useState<ExchangeItemRule[]>([])

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
                <li>法定节假日不受规则限制。</li>
                <li>白天时间：8:00~21:30，周末节假日：8:00~22:30</li>
                <li>夜间时间：21:30~次日 8:00，周末节假日：22:30~次日 8:00</li>
                <li>午休时间：13:00~14:00，此时间段为禁止时间</li>
            </ul>
        </div>
    )
}
