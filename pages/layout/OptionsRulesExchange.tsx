import { useState, useEffect } from 'react'
import type { ExchangeItemRule } from '@apps/lib/types'
import { optionsAPI } from '@apps/lib/api'
import { useSnackbar } from '@apps/components/Snackbar'
import {
    RulesPage,
    RenderDeleteButton,
    RenderInput,
} from '@apps/components/RulesPage'
import { DataTable, type Column } from '@apps/components/DataTable'
import { formatErrorMessage } from '@apps/lib/utils'

const defaultExchange: ExchangeItemRule[] = []

export function parseExchangeData(data: unknown): ExchangeItemRule[] {
    if (data && Array.isArray(data)) {
        return (data as Record<string, unknown>[]).map((item) => {
            const ratio =
                item.ratio !== undefined
                    ? Number(item.ratio)
                    : item.minutes !== undefined
                      ? Number(item.minutes)
                      : item.yuan !== undefined
                        ? Number(item.yuan)
                        : 1
            const unit =
                item.unit !== undefined
                    ? String(item.unit)
                    : item.minutes !== undefined
                      ? '分钟'
                      : item.yuan !== undefined
                        ? '元'
                        : '次'
            return {
                key: String(item.key ?? ''),
                label: String(item.label ?? ''),
                points: Number(item.points ?? 0),
                ratio,
                unit,
            } as ExchangeItemRule
        })
    }

    if (data && typeof data === 'object') {
        return Object.entries(data as Record<string, unknown>).map(
            ([key, val]) => {
                const item = val as Record<string, unknown>
                const minutes =
                    item.minutes != null ? Number(item.minutes) : undefined
                const yuan = item.yuan != null ? Number(item.yuan) : undefined

                if (item.ratio !== undefined) {
                    return {
                        key,
                        label: (item.label as string) ?? key,
                        points: Number(item.points ?? 0),
                        ratio: Number(item.ratio),
                        unit: (item.unit as string) ?? '次',
                    }
                }
                if (minutes !== undefined) {
                    return {
                        key,
                        label: (item.label as string) ?? key,
                        points: Number(item.points ?? 0),
                        ratio: minutes,
                        unit: '分钟',
                    }
                }
                if (yuan !== undefined) {
                    return {
                        key,
                        label: (item.label as string) ?? key,
                        points: Number(item.points ?? 0),
                        ratio: yuan,
                        unit: '元',
                    }
                }
                return {
                    key,
                    label: (item.label as string) ?? key,
                    points: Number(item.points ?? 0),
                    ratio: 1,
                    unit: '次',
                }
            },
        )
    }

    return defaultExchange
}

export function RulesExchange() {
    const [exchange, setExchange] =
        useState<ExchangeItemRule[]>(defaultExchange)
    const [saving, setSaving] = useState(false)
    const { showSnackbar } = useSnackbar()

    useEffect(() => {
        let cancelled = false
        optionsAPI
            .get('exchange')
            .then((data) => {
                if (!cancelled) setExchange(parseExchangeData(data))
            })
            .catch(() => showSnackbar('加载失败', 'error'))
        return () => {
            cancelled = true
        }
    }, [showSnackbar])

    const handleSave = async () => {
        setSaving(true)
        try {
            await optionsAPI.update('exchange', exchange)
            showSnackbar('保存成功！')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (
        index: number,
        field: keyof ExchangeItemRule,
        value: string | number,
    ) => {
        const updated = [...exchange]
        updated[index] = { ...updated[index], [field]: value }
        setExchange(updated)
    }

    const handleAddItem = () => {
        setExchange([
            ...exchange,
            { key: '', label: '', points: 1, ratio: 1, unit: '分钟' },
        ])
    }

    const handleRemove = (index: number) => {
        setExchange(exchange.filter((_, i) => i !== index))
    }

    const columns: Column<ExchangeItemRule>[] = [
        {
            key: 'key',
            header: '标识',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={exchange[i].key}
                    onChange={(v) => handleChange(i, 'key', v)}
                    placeholder="tv"
                />
            ),
        },
        {
            key: 'label',
            header: '名称',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={exchange[i].label}
                    onChange={(v) => handleChange(i, 'label', v)}
                    placeholder="娱乐时间"
                />
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (_, i) => (
                <RenderInput
                    type="number"
                    value={exchange[i].points}
                    onChange={(v) => handleChange(i, 'points', v)}
                />
            ),
        },
        {
            key: 'ratio',
            header: '比例',
            render: (_, i) => (
                <RenderInput
                    type="number"
                    value={exchange[i].ratio}
                    onChange={(v) => handleChange(i, 'ratio', v)}
                />
            ),
        },
        {
            key: 'unit',
            header: '单位',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={exchange[i].unit}
                    onChange={(v) => handleChange(i, 'unit', v)}
                    placeholder="分钟"
                />
            ),
        },
        {
            key: 'action',
            header: '操作',
            render: (_, i) => (
                <RenderDeleteButton onClick={() => handleRemove(i)} />
            ),
        },
    ]

    return (
        <RulesPage
            title="积分兑换规则"
            add={handleAddItem}
            save={handleSave}
            disabled={saving}>
            <DataTable
                data={exchange}
                columns={columns}
                rowKey={(_, i) => String(i)}
            />
        </RulesPage>
    )
}
