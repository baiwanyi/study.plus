import { useState, useEffect, useMemo } from 'react'
import type { Exchange, ExchangeItemRule } from '@apps/lib/types'
import {
    formatDate,
    exchangeStatusLabels,
    exchangeStatusColors,
    paginate,
    isAdmin,
} from '@apps/lib/utils'
import { DataTable, type Column } from '@apps/components/DataTable'

interface ExchangesListTableProps {
    exchanges: Exchange[]
    exchangeRules: ExchangeItemRule[]
    onRevoke: (id: number) => void
}

const getRuleByKey = (
    rules: ExchangeItemRule[],
    key: string,
): ExchangeItemRule | undefined => rules.find((r) => r.key === key)

const getItemLabel = (rules: ExchangeItemRule[], key: string): string =>
    getRuleByKey(rules, key)?.label ?? key

const getExchangeDetail = (
    rules: ExchangeItemRule[],
    key: string,
    cost: number,
): string => {
    const rate = getRuleByKey(rules, key)
    if (!rate) return ''
    const quantity = (cost / rate.points) * rate.ratio
    return `${Number.isInteger(quantity) ? quantity : quantity.toFixed(1)} ${rate.unit}`
}

export default function ExchangesListTable({
    exchanges,
    exchangeRules,
    onRevoke,
}: ExchangesListTableProps) {
    const [page, setPage] = useState(1)
    const pagedExchanges = useMemo(
        () => paginate(exchanges, page),
        [exchanges, page],
    )

    useEffect(() => setPage(1), [exchanges.length])

    const columns: Column<Exchange>[] = [
        {
            key: 'createdAt',
            header: '时间',
            render: (record) => (
                <span className="text-xs text-gray-600">
                    {formatDate(record.createdAt)}
                </span>
            ),
        },
        {
            key: 'itemType',
            header: '项目',
            render: (record) => (
                <span className="badge-primary">
                    {getItemLabel(exchangeRules, record.itemType)}
                </span>
            ),
        },
        {
            key: 'pointsCost',
            header: '消耗积分',
            render: (record) => (
                <span className="text-danger font-medium">
                    -{record.pointsCost}
                </span>
            ),
        },
        {
            key: 'detail',
            header: '兑换内容',
            render: (record) => (
                <span className="text-gray-700">
                    {record.detail ??
                        getExchangeDetail(
                            exchangeRules,
                            record.itemType,
                            record.pointsCost,
                        )}
                </span>
            ),
        },
        {
            key: 'status',
            header: '状态',
            render: (record) => (
                <span className={exchangeStatusColors[record.status]}>
                    {exchangeStatusLabels[record.status]}
                </span>
            ),
        },
        {
            key: 'actions',
            header: '操作',
            render: (record) => (
                <button
                    disabled={!(record.status === 'active' && isAdmin())}
                    onClick={() => onRevoke(record.id)}
                    className="btn-danger btn-sm">
                    撤销
                </button>
            ),
        },
    ]

    return (
        <div className="card overflow-hidden !p-0">
            <DataTable<Exchange>
                data={pagedExchanges}
                columns={columns}
                emptyText="暂无兑换记录"
                pagination={{
                    current: page,
                    total: exchanges.length,
                    onChange: setPage,
                }}
            />
        </div>
    )
}
