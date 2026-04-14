import { useState, useEffect } from 'react'
import { optionsAPI, quotesApi } from '@apps/lib/api'
import { defaultQuotes } from '@/apps/lib/default'
import { useSnackbar } from '@components/Snackbar'
import { formatErrorMessage, taskClassLabels } from '@apps/lib/utils'
import { RulesPage } from '@apps/components/RulesPage'

interface SystemSettings {
    monthlyBasePoints: number
    minimumPointsForPrivileges: number
    pageSize: number
    autosaveInterval: number
    grade: number
}

const defaultSettings: SystemSettings = {
    monthlyBasePoints: 500,
    minimumPointsForPrivileges: 100,
    pageSize: 20,
    autosaveInterval: 10,
    grade: 1,
}
export function RulesSystem() {
    const { showSnackbar } = useSnackbar()
    const [settings, setSettings] = useState<SystemSettings>(defaultSettings)
    const [quotes, setQuotes] = useState(defaultQuotes)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        let cancelled = false
        optionsAPI
            .get('system')
            .then((data) => {
                if (cancelled) return
                setSettings({
                    ...defaultSettings,
                    ...(data as Partial<SystemSettings>),
                })
            })
            .catch(() => showSnackbar('加载失败', 'error'))

        quotesApi
            .get()
            .then((data) => {
                if (cancelled) return
                setQuotes(Array.isArray(data) ? data : defaultQuotes)
            })
            .catch(() => {})

        return () => {
            cancelled = true
        }
    }, [showSnackbar])

    const handleNumberChange = (field: keyof SystemSettings, value: string) => {
        const num = Number(value)
        if (isNaN(num)) return
        setSettings((prev) => ({ ...prev, [field]: num }))
    }

    const fieldMin: Record<keyof SystemSettings, number> = {
        monthlyBasePoints: 0,
        minimumPointsForPrivileges: 0,
        pageSize: 1,
        autosaveInterval: 1,
        grade: 1,
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await optionsAPI.update('system', {
                monthlyBasePoints: settings.monthlyBasePoints,
                minimumPointsForPrivileges: settings.minimumPointsForPrivileges,
                pageSize: settings.pageSize,
                autosaveInterval: settings.autosaveInterval,
                grade: settings.grade,
            })
            await quotesApi.update(quotes)
            showSnackbar('保存成功！')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const numberFields: { key: keyof SystemSettings; label: string }[] = [
        { key: 'monthlyBasePoints', label: '月初始积分' },
        { key: 'minimumPointsForPrivileges', label: '特权最低积分' },
        { key: 'pageSize', label: '每页显示条数' },
        { key: 'autosaveInterval', label: '自动保存间隔（秒）' },
    ]

    return (
        <RulesPage title="系统设置" save={handleSave} disabled={saving}>
            <div className="space-y-4">
                {numberFields.map(({ key, label }) => (
                    <div className="space-y-1" key={key}>
                        <label className="label">{label}</label>
                        <input
                            type="number"
                            className="regular-text"
                            value={settings[key]}
                            min={fieldMin[key]}
                            disabled={saving}
                            onChange={(e) =>
                                handleNumberChange(key, e.target.value)
                            }
                        />
                    </div>
                ))}
                <div className="space-y-1">
                    <label className="label">年级</label>
                    <select
                        className="regular-text"
                        value={settings.grade}
                        onChange={(e) =>
                            handleNumberChange('grade', e.target.value)
                        }>
                        {taskClassLabels.map((label, index) => (
                            <option key={index} value={index}>
                                {label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="label">名言名句</label>
                    <textarea
                        className="regular-text"
                        rows={10}
                        disabled={saving}
                        value={quotes.join('\n')}
                        onChange={(e) => setQuotes(e.target.value.split('\n'))}
                        placeholder="每行一条名言，使用回车换行"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                        每行一条名言，使用回车换行
                    </p>
                </div>
            </div>
        </RulesPage>
    )
}
