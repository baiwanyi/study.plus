import { useState, useEffect } from 'react'
import type { CustomRule } from '@apps/lib/types'
import { rulesApi } from '@apps/lib/api'
import { useSnackbar } from '@components/Snackbar'
import { formatErrorMessage } from '@apps/lib/utils'
import {
    RulesPage,
    RenderDeleteButton,
    RenderInput,
} from '@apps/components/RulesPage'
import { DataTable, type Column } from '@apps/components/DataTable'

const defaultCustom: CustomRule[] = []

export function parseCustomData(data: unknown): CustomRule[] {
    if (data && Array.isArray(data)) return data as CustomRule[]
    return defaultCustom
}

export function RulesCustom() {
    const { showSnackbar } = useSnackbar()
    const [custom, setCustom] = useState<CustomRule[]>(defaultCustom)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        rulesApi
            .get('custom')
            .then((data) => {
                if (!cancelled) setCustom(parseCustomData(data))
            })
            .catch(() => showSnackbar('加载失败', 'error'))
        return () => {
            cancelled = true
        }
    }, [showSnackbar])

    const handleAddItem = () => {
        setCustom([
            ...custom,
            { name: '', type: 'earn', points: 0, description: '' },
        ])
    }

    const handleRemove = (index: number) => {
        setCustom(custom.filter((_, i) => i !== index))
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await rulesApi.update('custom', custom)
            showSnackbar('保存成功！')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (
        index: number,
        field: keyof CustomRule,
        value: string | number,
    ) => {
        const updated = [...custom]
        updated[index] = { ...updated[index], [field]: value }
        setCustom(updated)
    }

    const columns: Column<CustomRule>[] = [
        {
            key: 'name',
            header: '名称',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={custom[i].name}
                    onChange={(v) => handleChange(i, 'name', v)}
                    placeholder="规则名"
                />
            ),
        },
        {
            key: 'type',
            header: '类型',
            render: (_, i) => (
                <select
                    className="input"
                    value={custom[i].type}
                    onChange={(e) =>
                        handleChange(
                            i,
                            'type',
                            e.target.value as CustomRule['type'],
                        )
                    }>
                    <option value="earn">加分</option>
                    <option value="deduct">扣分</option>
                </select>
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (_, i) => (
                <RenderInput
                    type="number"
                    value={custom[i].points}
                    onChange={(v) => handleChange(i, 'points', v)}
                />
            ),
        },
        {
            key: 'description',
            header: '描述',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={custom[i].description}
                    onChange={(v) => handleChange(i, 'description', v)}
                    placeholder="描述"
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
            title="自定义规则"
            add={handleAddItem}
            save={handleSave}
            disabled={saving}>
            <DataTable
                data={custom}
                columns={columns}
                rowKey={(_, i) => String(i)}
                emptyText="暂无自定义规则"
            />
        </RulesPage>
    )
}
