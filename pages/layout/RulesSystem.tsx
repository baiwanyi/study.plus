import { useState, useEffect } from 'react'
import { rulesApi } from '@apps/lib/api'
import { useSnackbar } from '@components/Snackbar'
import { formatErrorMessage } from '@apps/lib/utils'
import { RulesPage } from '@apps/components/RulesPage'

interface SystemSettings {
    monthlyBasePoints: number
    minimumPointsForPrivileges: number
    pageSize: number
    autosaveInterval: number
}

const defaultSettings: SystemSettings = {
    monthlyBasePoints: 500,
    minimumPointsForPrivileges: 100,
    pageSize: 20,
    autosaveInterval: 10,
}

export function RulesSystem() {
    const { showSnackbar } = useSnackbar()
    const [settings, setSettings] = useState<SystemSettings>(defaultSettings)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        rulesApi
            .get('system')
            .then((data) => {
                if (cancelled) return
                setSettings({
                    ...defaultSettings,
                    ...(data as Partial<SystemSettings>),
                })
            })
            .catch(() => showSnackbar('加载失败', 'error'))

        return () => {
            cancelled = true
        }
    }, [showSnackbar])

    const handleChange = (
        field: keyof SystemSettings,
        value: string | number,
    ) => {
        const num = Number(value)
        if (isNaN(num)) return
        setSettings((prev) => ({ ...prev, [field]: num }))
    }

    // 每个字段的最小值约束
    const fieldMin: Record<keyof SystemSettings, number> = {
        monthlyBasePoints: 0,
        minimumPointsForPrivileges: 0,
        pageSize: 1,
        autosaveInterval: 1,
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await rulesApi.update('system', {
                monthlyBasePoints: settings.monthlyBasePoints,
                minimumPointsForPrivileges: settings.minimumPointsForPrivileges,
                pageSize: settings.pageSize,
                autosaveInterval: settings.autosaveInterval,
            })
            showSnackbar('保存成功！')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const fields: {
        key: keyof SystemSettings
        label: string
    }[] = [
        { key: 'monthlyBasePoints', label: '月初始积分' },
        { key: 'minimumPointsForPrivileges', label: '特权最低积分' },
        { key: 'pageSize', label: '每页显示条数' },
        { key: 'autosaveInterval', label: '自动保存间隔（秒）' },
    ]

    return (
        <RulesPage title="系统设置" save={handleSave} disabled={saving}>
            <div className="space-y-4">
                {fields.map(({ key, label }) => (
                    <div key={key}>
                        <label className="label">{label}</label>
                        <input
                            type="number"
                            className="input"
                            value={settings[key]}
                            min={fieldMin[key]}
                            disabled={saving}
                            onChange={(e) => {
                                handleChange(key, e.target.value)
                            }}
                        />
                    </div>
                ))}
            </div>
        </RulesPage>
    )
}
