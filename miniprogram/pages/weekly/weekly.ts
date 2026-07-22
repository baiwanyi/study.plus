import { callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'

interface WeeklyItem {
    id: number
    year: number
    week_number: number
    content: string | Record<string, string>
    analysis: string | null
    label: string
    hasAnalysis: boolean
}

interface FormField {
    key: string
    label: string
    placeholder: string
}

Page({
    data: {
        list: [] as WeeklyItem[],
        loading: true,
        showForm: false,
        showDetail: false,
        analyzing: false,
        formYear: new Date().getFullYear(),
        formWeek: 1,
        content: {} as Record<string, string>,
        formFields: [
            { key: 'learned', label: '本周学了什么', placeholder: '回顾本周主要学习内容' },
            { key: 'difficulties', label: '遇到的困难', placeholder: '哪些知识点比较吃力' },
            { key: 'weakPoints', label: '薄弱环节', placeholder: '需要加强的地方' },
            { key: 'achievement', label: '小成就', placeholder: '值得肯定的进步' },
            { key: 'lastWeekGoalReview', label: '上周目标回顾', placeholder: '上周目标完成得怎样' },
            { key: 'smartGoalS', label: '本周目标（具体）', placeholder: '明确、具体的目标' },
            { key: 'smartGoalM', label: '本周目标（可衡量）', placeholder: '如何衡量完成' },
            { key: 'smartGoalA', label: '本周目标（可达成）', placeholder: '跳一跳够得着' },
            { key: 'smartGoalR', label: '本周目标（有价值）', placeholder: '为什么重要' },
            { key: 'smartGoalT', label: '本周目标（有时限）', placeholder: '什么时候完成' },
            { key: 'improvement', label: '改进计划', placeholder: '下周打算怎么做' },
        ] as FormField[],
        detail: null as WeeklyItem | null,
        analysisObj: null as Record<string, string> | null,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        this.loadList()
    },
    async loadList() {
        this.setData({ loading: true })
        try {
            const list = await callCloudFunction<WeeklyItem[]>('weekly', { action: 'list' })
            const decorated = (list || []).map((r) => {
                let contentObj: Record<string, string> = {}
                try {
                    const parsed = JSON.parse(r.content)
                    contentObj = typeof parsed === 'object' ? parsed : {}
                } catch {
                    contentObj = {}
                }
                return {
                    ...r,
                    content: contentObj,
                    label: `${r.year} 年第 ${r.week_number} 周`,
                    hasAnalysis: !!r.analysis,
                }
            })
            this.setData({ list: decorated, loading: false })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ loading: false })
        }
    },
    openCreate() {
        const content: Record<string, string> = {}
        for (const f of this.data.formFields) content[f.key] = ''
        const now = new Date()
        const startOfYear = new Date(now.getFullYear(), 0, 1)
        const week = Math.ceil((now.getTime() - startOfYear.getTime()) / (7 * 86400000))
        this.setData({
            showForm: true,
            content,
            formYear: now.getFullYear(),
            formWeek: week,
        })
    },
    closeForm() {
        this.setData({ showForm: false })
    },
    onFormVisible(e: WechatMiniprogram.CustomEvent) {
        this.setData({ showForm: e.detail.visible })
    },
    onFieldInput(e: WechatMiniprogram.CustomEvent) {
        const key = e.currentTarget.dataset.field as string
        this.setData({ [`content.${key}`]: e.detail.value })
    },
    onYearInput(e: WechatMiniprogram.Input) {
        const v = Number(e.detail.value)
        this.setData({ formYear: Number.isFinite(v) ? v : new Date().getFullYear() })
    },
    onWeekInput(e: WechatMiniprogram.Input) {
        const v = Number(e.detail.value)
        this.setData({ formWeek: Number.isFinite(v) ? v : 1 })
    },
    async onSubmit() {
        const childId = getCurrentChildId()
        if (!childId) {
            wx.showToast({ title: '请先选择孩子', icon: 'none' })
            return
        }
        try {
            await callCloudFunction('weekly', {
                action: 'create',
                year: this.data.formYear,
                weekNumber: this.data.formWeek,
                content: this.data.content,
                childId,
            })
            wx.showToast({ title: '已保存', icon: 'success' })
            this.setData({ showForm: false })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '保存失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    openDetail(e: WechatMiniprogram.TouchEvent) {
        const id = Number(e.currentTarget.dataset.id)
        const item = this.data.list.find((r) => r.id === id) ?? null
        if (!item) return
        let analysisObj: Record<string, string> | null = null
        if (item.analysis) {
            try {
                const parsed = JSON.parse(item.analysis)
                analysisObj = typeof parsed === 'object' ? parsed : null
            } catch {
                analysisObj = null
            }
        }
        this.setData({ showDetail: true, detail: item, analysisObj })
    },
    closeDetail() {
        this.setData({ showDetail: false })
    },
    onDetailVisible(e: WechatMiniprogram.CustomEvent) {
        this.setData({ showDetail: e.detail.visible })
    },
    async onAnalyze() {
        if (!this.data.detail) return
        this.setData({ analyzing: true })
        try {
            const res = await callCloudFunction<{ analysis: Record<string, string> }>('weekly', {
                action: 'analyze',
                id: this.data.detail.id,
                childId: getCurrentChildId(),
            })
            this.setData({ analysisObj: res?.analysis ?? null, analyzing: false })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '分析失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ analyzing: false })
        }
    },
})
