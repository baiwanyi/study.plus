import { getToken, getCurrentChildId } from '../../utils/auth'
import { callCloudFunction } from '../../utils/api'

interface Advance {
    id: number
    amount: number
    total_repayment: number
    installments: number
    installment_amount: number
    paid_installments: number
    status: string
    created_at: string
}

interface DisplayAdvance extends Advance {
    statusLabel: string
    progress: string
    color: string
}

interface AdvanceSummary {
    totalPendingRepayment: number
    currentInstallmentDue: number
    totalRemainingInstallments: number
    remainingCredit: number
    maxPendingAmount: number
}

const INSTALLMENT_OPTIONS = [
    { label: '1 期', value: 1 },
    { label: '3 期', value: 3 },
    { label: '6 期', value: 6 },
    { label: '9 期', value: 9 },
    { label: '12 期', value: 12 },
]

function decorate(a: Advance): DisplayAdvance {
    const completed = a.status === 'completed'
    return {
        ...a,
        statusLabel: completed ? '已还清' : '还款中',
        progress: `${a.paid_installments}/${a.installments} 期`,
        color: completed ? '#6B7280' : '#FF8C00',
    }
}

interface IBorrowData {
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    list: DisplayAdvance[]
    summary: AdvanceSummary | null
    loading: boolean
    showCreate: boolean
    showTermSheet: boolean
    amount: number
    installments: number
    termLabel: string
}

Page<IBorrowData>({
    data: {
        children: [],
        currentChildId: null,
        list: [],
        summary: null,
        loading: false,
        showCreate: false,
        showTermSheet: false,
        amount: 50,
        installments: 3,
        termLabel: '3 期',
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
            const [list, summary] = await Promise.all([
                callCloudFunction<Advance[]>('advances', { action: 'list' }),
                callCloudFunction<AdvanceSummary>('advances', { action: 'summary' }),
            ])
            this.setData({ list: (list || []).map(decorate), summary })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    openCreate() {
        this.setData({
            showCreate: true,
            amount: 50,
            installments: 3,
            termLabel: '3 期',
        })
    },
    closeCreate() {
        this.setData({ showCreate: false })
    },
    onAmountChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ amount: Number(e.detail.value) })
    },
    openTermSheet() {
        this.setData({ showTermSheet: true })
    },
    closeTermSheet() {
        this.setData({ showTermSheet: false })
    },
    onPickTerm(e: WechatMiniprogram.CustomEvent) {
        const item = INSTALLMENT_OPTIONS[e.detail.index]
        if (item) {
            this.setData({ installments: item.value, termLabel: item.label })
        }
        this.setData({ showTermSheet: false })
    },
    async onCreateConfirm() {
        try {
            await callCloudFunction('advances', {
                action: 'create',
                amount: this.data.amount,
                installments: this.data.installments,
            })
            this.setData({ showCreate: false })
            wx.showToast({ title: '预支成功', icon: 'success' })
            this.loadAll()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '预支失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
})
