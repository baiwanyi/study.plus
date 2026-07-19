'use client'

import { useEffect, useRef } from 'react'
import { weeklyApi } from '@apps/utils/api'
import { useSnackbar } from '@components/Snackbar'
import type { WeeklyReport } from '@shared/types'
import type { WeeklyReportContent } from '@shared/weekly'

/**
 * 自动保存 Hook：当 modal 打开时，每 10 秒检测表单变化并自动保存。
 * 返回 { isAutoSavingRef, lastSavedFormRef } 供外部 handleSave 同步使用。
 */
export function useWeeklyAutoSave(
    editingReport: WeeklyReport | null,
    form: WeeklyReportContent,
    modalOpen: boolean,
) {
    const { showSnackbar } = useSnackbar()
    const lastSavedFormRef = useRef('')
    const isAutoSavingRef = useRef(false)
    const formRef = useRef(form)
    const editingReportRef = useRef(editingReport)

    // 保持闭包内的数据最新
    formRef.current = form
    editingReportRef.current = editingReport

    useEffect(() => {
        if (!modalOpen) return
        lastSavedFormRef.current = JSON.stringify(formRef.current)
        const timer = setInterval(async () => {
            if (isAutoSavingRef.current || !editingReportRef.current) return
            const formStr = JSON.stringify(formRef.current)
            if (formStr === lastSavedFormRef.current) return
            isAutoSavingRef.current = true
            try {
                await weeklyApi.update(editingReportRef.current.id, {
                    content: formRef.current,
                })
                lastSavedFormRef.current = formStr
                showSnackbar('已自动保存', 'success')
            } catch {
                // 自动保存静默失败，不打扰用户
            } finally {
                isAutoSavingRef.current = false
            }
        }, 10000)
        return () => clearInterval(timer)
    }, [modalOpen, showSnackbar])

    return { isAutoSavingRef, lastSavedFormRef }
}
