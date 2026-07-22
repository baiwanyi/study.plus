import { callWithStaleRefresh, callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'
import { pointTypeLabels, relatedTypeLabels, defaultGradeValues } from '../../utils/constants'

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

interface PointsData {
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    user: { nickname: string } | null
    isWide: boolean
    isParent: boolean
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

Page<PointsData>({
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
        user: null,
        isWide: false,
        isParent: false,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<AppOption>()
        this.setData({
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
            user: app.globalData.user,
            isWide: app.globalData.platform.isWide,
            isParent: app.globalData.user?.role === 'parent',
        })
        this.loadAll()
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<AppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
        this.loadAll()
    },
    async loadAll() {
        const childId = getCurrentChildId()
        const suffix = childId ? `uid_${childId}` : undefined

        // 并行 stale-refresh：先展示缓存，后台拉取最新
        const promises = [
            callWithStaleRefresh<PointRecord[]>('points', { action: 'list' }, (list) => {
                this.setData({ list: (list || []).map(decorate) })
            }, { keySuffix: suffix }),
            callWithStaleRefresh<Summary>('points', { action: 'summary' }, (summary) => {
                this.setData({ summary })
            }, { keySuffix: suffix }),
            callWithStaleRefresh<Stats>('points', { action: 'stats' }, (stats) => {
                this.setData({ stats })
            }, { keySuffix: suffix }),
        ]

        try {
            await Promise.all(promises)
        } catch (err) {
            // 所有调用都失败时（含无缓存）才提示
            if (!this.data.summary && !this.data.stats) {
                const msg = err instanceof Error ? err.message : '加载失败'
                wx.showToast({ title: msg, icon: 'none' })
            }
        }
    },
    onLogout() {
        wx.switchTab({ url: '/pages/my/my' })
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
