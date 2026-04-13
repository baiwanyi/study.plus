import { useState, useEffect } from 'react'
import type { HomeworkGradeRule } from '@apps/lib/types'
import { optionsAPI } from '@apps/lib/api'
import { useSnackbar } from '@apps/components/Snackbar'
import { formatErrorMessage } from '@apps/lib/utils'
import {
    RulesPage,
    RenderDeleteButton,
    RenderInput,
} from '@apps/components/RulesPage'
import { DataTable, type Column } from '@apps/components/DataTable'

const defaultHomework: HomeworkGradeRule[] = []

export function parseHomeworkData(data: unknown): HomeworkGradeRule[] {
    if (Array.isArray(data)) return data as HomeworkGradeRule[]
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return Object.entries(data as Record<string, unknown>).map(
            ([grade, points]) => ({
                grade,
                points: Number(points),
            }),
        )
    }
    return defaultHomework
}

export function RulesHomework() {
    const [homework, setHomework] =
        useState<HomeworkGradeRule[]>(defaultHomework)
    const [saving, setSaving] = useState(false)
    const { showSnackbar } = useSnackbar()

    useEffect(() => {
        let cancelled = false
        optionsAPI
            .get('homework')
            .then((data) => {
                if (!cancelled) setHomework(parseHomeworkData(data))
            })
            .catch(() => showSnackbar('加载失败', 'error'))
        return () => {
            cancelled = true
        }
    }, [showSnackbar])

    const handleSave = async () => {
        setSaving(true)
        try {
            await optionsAPI.update('homework', homework)
            showSnackbar('保存成功！')
        } catch (err) {
            showSnackbar('保存失败: ' + formatErrorMessage(err), 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleChange = (
        index: number,
        field: keyof HomeworkGradeRule,
        value: string | number,
    ) => {
        const updated = [...homework]
        updated[index] = { ...updated[index], [field]: value }
        setHomework(updated)
    }

    const handleAddItem = () => {
        setHomework([...homework, { grade: '', points: 0 }])
    }

    const handleRemove = (index: number) => {
        setHomework(homework.filter((_, i) => i !== index))
    }

    const columns: Column<HomeworkGradeRule>[] = [
        {
            key: 'grade',
            header: '等级',
            render: (_, i) => (
                <RenderInput
                    type="text"
                    value={homework[i].grade}
                    onChange={(v) => handleChange(i, 'grade', v)}
                    placeholder="等级"
                />
            ),
        },
        {
            key: 'points',
            header: '积分',
            render: (_, i) => (
                <RenderInput
                    type="number"
                    value={homework[i].points}
                    onChange={(v) => handleChange(i, 'points', v)}
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
            title="作业评分积分"
            add={handleAddItem}
            save={handleSave}
            disabled={saving}>
            <DataTable
                data={homework}
                columns={columns}
                rowKey={(_, i) => String(i)}
            />
        </RulesPage>
    )
}
