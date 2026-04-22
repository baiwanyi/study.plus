import { useState, useEffect } from 'react'
import { optionsAPI } from '@apps/lib/api'
import type { CustomRule } from '@apps/lib/types'
import { pointColors, pointSymbol } from '@apps/lib/utils'
import { parseCustomData } from '@/pages/layout/OptionsRulesCustom'
import { DataTable, type Column } from '@apps/components/DataTable'

export default function WidgetCustomRules() {
    const [customRules, setCustomRules] = useState<CustomRule[]>([])

    useEffect(() => {
        optionsAPI
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
                <span className="font-medium text-heading">{rule.name}</span>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (rule) => (
                <span className={pointColors[rule.type]}>
                    {pointSymbol[rule.type]}
                    {Math.abs(rule.points)}
                </span>
            ),
        },
        {
            key: 'description',
            header: '说明',
            render: (rule) => (
                <span className="text-muted">{rule.description}</span>
            ),
        },
    ]

    return (
        <div className="card space-y-4">
            <h3>自定义规则</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DataTable
                    captionText="自定义加分规则"
                    data={customRules.filter((r) => r.type === 'earn')}
                    columns={columns}
                    rowKey={(rule, idx) =>
                        rule.name || rule.id || `custom-${idx}`
                    }
                />
                <DataTable
                    captionText="自定义扣分规则"
                    data={customRules.filter((r) => r.type === 'deduct')}
                    columns={columns}
                    rowKey={(rule, idx) =>
                        rule.name || rule.id || `custom-${idx}`
                    }
                />
            </div>
        </div>
    )
}
