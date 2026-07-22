import { callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'
import {
    studynotesSubjectLabels,
    studynotesSubjectValues,
} from '../../utils/constants'

interface NoteItem {
    id: number
    subject: string
    topic: string
    summary: string
    example: string
    stuck_points: string
    memory_hook: string | null
    evaluation: string | null
    follow_up_score: number | null
    followUpCount: number
    subjectLabel: string
    hasEvaluation: boolean
}

Page({
    data: {
        list: [] as NoteItem[],
        loading: true,
        showForm: false,
        evaluating: false,
        showDetail: false,
        isWide: false,
        subjectIndex: 0,
        subjectValues: studynotesSubjectValues as unknown as string[],
        subjectLabels: studynotesSubjectValues.map((s) => studynotesSubjectLabels[s]),
        form: {
            topic: '',
            summary: '',
            example: '',
            stuckPoints: '',
            memoryHook: '',
        },
        detail: null as NoteItem | null,
        evaluationObj: null as Record<string, unknown> | null,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<AppOption>()
        this.setData({
            isWide: app.globalData.platform.isWide,
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
            user: app.globalData.user,
        })
        this.loadList()
    },
    async loadList() {
        this.setData({ loading: true })
        try {
            const list = await callCloudFunction<NoteItem[]>('studynotes', { action: 'list' })
            const decorated = (list || []).map((n) => ({
                ...n,
                subjectLabel: studynotesSubjectLabels[n.subject] || n.subject,
                hasEvaluation: !!n.evaluation,
            }))
            this.setData({ list: decorated, loading: false })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ loading: false })
        }
    },
    openCreate() {
        this.setData({
            showForm: true,
            subjectIndex: 0,
            form: { topic: '', summary: '', example: '', stuckPoints: '', memoryHook: '' },
        })
    },
    closeForm() {
        this.setData({ showForm: false })
    },
    onFormVisible(e: WechatMiniprogram.CustomEvent) {
        this.setData({ showForm: e.detail.visible })
    },
    onSubjectChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ subjectIndex: e.detail.value })
    },
    onFormInput(e: WechatMiniprogram.CustomEvent) {
        const key = e.currentTarget.dataset.field as string
        this.setData({ [`form.${key}`]: e.detail.value })
    },
    async onSubmit() {
        const childId = getCurrentChildId()
        if (!childId) {
            wx.showToast({ title: '请先选择孩子', icon: 'none' })
            return
        }
        const subject = this.data.subjectValues[this.data.subjectIndex]
        const { topic, summary, example, stuckPoints, memoryHook } = this.data.form
        if (!summary.trim() || !example.trim()) {
            wx.showToast({ title: '概括和例子为必填', icon: 'none' })
            return
        }
        try {
            await callCloudFunction('studynotes', {
                action: 'create',
                subject,
                topic,
                summary,
                example,
                stuckPoints,
                memoryHook: memoryHook || undefined,
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
        const item = this.data.list.find((n) => n.id === id) ?? null
        if (!item) return
        let evaluationObj: Record<string, unknown> | null = null
        if (item.evaluation) {
            try {
                const parsed = JSON.parse(item.evaluation)
                evaluationObj = typeof parsed === 'object' ? parsed : null
            } catch {
                evaluationObj = null
            }
        }
        this.setData({ showDetail: true, detail: item, evaluationObj })
    },
    closeDetail() {
        this.setData({ showDetail: false })
    },
    onDetailVisible(e: WechatMiniprogram.CustomEvent) {
        this.setData({ showDetail: e.detail.visible })
    },
    async     onEvaluate() {
        if (!this.data.detail) return
        this.setData({ evaluating: true })
        try {
            const res = await callCloudFunction<{
                evaluation: Record<string, unknown>
                evaluatedAt: string
            }>('studynotes', {
                action: 'evaluate',
                id: this.data.detail.id,
                childId: getCurrentChildId(),
            })
            this.setData({ evaluationObj: res?.evaluation ?? null, evaluating: false })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '评估失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ evaluating: false })
        }
    },
    onLogout() {
        wx.reLaunch({ url: '/pages/my/my' })
    },
})
