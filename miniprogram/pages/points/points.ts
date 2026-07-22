import { getToken, getCurrentChildId } from '../../utils/auth'
import { callCloudFunction } from '../../utils/api'
import { pointTypeLabels, relatedTypeLabels, gradeColors, defaultGradeValues } from '../../utils/constants'

interface PointRecord {
    id: number
    type: string
    amount: number
    reason: string
    rule_name: string | null
    related_type: string | null
    created_at: string
}

interface DisplayRecord extends PointRecord {
    sign: string
    color: string
    typeLabel: string
    relatedLabel: string
    time: string
}

interface Summary {
    basePoints: number
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    minimumPointsForPrivileges: number
    monthlyBasePoints: number
}

interface Stats {
    month: string
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    net: number
}

interface IPointsData {
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    list: DisplayRecord[]
    loading: boolean
    summary: Summary | null
    stats: Stats | null
    showGradeSheet: boolean
    showGradeRemark: boolean
    gradeOptions: Array<{ label: string; value: string }>
    gradeRemark: string
    pendingGrade: string
    showExam: boolean
    examScore: string
    examRemark: string
}

function decorate(r: PointRecord): DisplayRecord {
    const isEarn = r.type === 'earn'
    return {
        ...r,
        sign: isEarn ? '+' : '-',
        color: isEarn ? '#07C160' : '#FA5151',
        typeLabel: pointTypeLabels[r.type] || r.type,
        relatedLabel: r.related_type ? relatedTypeLabels[r.related_type] || '' : '',
        time: (r.created_at || '').slice(5, 16).replace('T', ' '),
    }
}

Page<IPointsData>({
    data: {
        children: [],
        currentChildId: null,
        list: [],
        loading: false,
        summary: null,
        stats: null,
        showGradeSheet: false,
        showGradeRemark: false,
        gradeOptions: defaultGradeValues.map((g) => ({ label: g, value: g })),
        gradeRemark: '',
        pendingGrade: '',
        showExam: false,
        examScore: '',
        examRemark: '',
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<IAppOption>()
        this.setData({
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
        })
        this.loadAll()
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<IAppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
        this.loadAll()
    },
    async loadAll() {
        this.setData({ loading: true })
        try {
            const [list, summary, stats] = await Promise.all([
                callCloudFunction<PointRecord[]>('points', { action: 'list' }),
                callCloudFunction<Summary>('points', { action: 'summary' }),
                callCloudFunction<Stats>('points', { action: 'stats' }),
            ])
            this.setData({
                list: (list || []).map(decorate),
                summary,
                stats,
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    goExchange() {
        wx.navigateTo({ url: '/pages/exchanges/exchanges' })
    },
    goBorrow() {
        wx.navigateTo({ url: '/pages/borrow/borrow' })
    },
    openGrade() {
        this.setData({ showGradeSheet: true })
    },
    closeGradeSheet() {
        this.setData({ showGradeSheet: false })
    },
    onGradePick(e: WechatMiniprogram.CustomEvent) {
        const grade = this.data.gradeOptions[e.detail.index]?.value
        if (!grade) return
        this.setData({
            pendingGrade: grade,
            showGradeSheet: false,
            showGradeRemark: true,
            gradeRemark: '',
        })
    },
    closeGradeRemark() {
        this.setData({ showGradeRemark: false })
    },
    onGradeRemark(e: WechatMiniprogram.Input) {
        this.setData({ gradeRemark: e.detail.value })
    },
    async onGradeConfirm() {
        const grade = this.data.pendingGrade
        if (!grade) return
        this.setData({ showGradeRemark: false })
        try {
            await callCloudFunction('points', {
                action: 'by-grade',
                category: 'submission',
                grade,
                remark: this.data.gradeRemark || undefined,
            })
            wx.showToast({ title: '已记录', icon: 'success' })
            this.loadAll()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '操作失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    openExam() {
        this.setData({ showExam: true, examScore: '', examRemark: '' })
    },
    closeExam() {
        this.setData({ showExam: false })
    },
    onExamScore(e: WechatMiniprogram.Input) {
        this.setData({ examScore: e.detail.value })
    },
    onExamRemark(e: WechatMiniprogram.Input) {
        this.setData({ examRemark: e.detail.value })
    },
    async onExamConfirm() {
        const score = Number(this.data.examScore)
        if (!Number.isFinite(score) || score < 0 || score > 100) {
            wx.showToast({ title: '请输入 0-100 分', icon: 'none' })
            return
        }
        this.setData({ showExam: false })
        try {
            await callCloudFunction('points', {
                action: 'by-exam-score',
                score,
                remark: this.data.examRemark || undefined,
            })
            wx.showToast({ title: '已记录', icon: 'success' })
            this.loadAll()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '操作失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
})
