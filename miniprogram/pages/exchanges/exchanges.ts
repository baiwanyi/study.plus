import { callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'
import { exchangeStatusLabels } from '../../utils/constants'

interface Exchange {
    id: number
    item_type: string
    points_cost: number
    detail: string
    status: string
    created_at: string
}

interface DisplayExchange extends Exchange {
    itemLabel: string
    statusLabel: string
    time: string
    color: string
}

const EXCHANGE_OPTIONS = [
    { label: '娱乐时间', value: 'game' },
    { label: '现金兑换', value: 'cash' },
]

const EXCHANGE_LABELS: Record<string, string> = {
    game: '娱乐时间',
    games: '娱乐时间',
    cash: '现金兑换',
}

function decorate(e: Exchange): DisplayExchange {
    const revoked = e.status === 'revoked'
    return {
        ...e,
        itemLabel: EXCHANGE_LABELS[e.item_type] || e.item_type,
        statusLabel: exchangeStatusLabels[e.status] || e.status,
        time: (e.created_at || '').slice(5, 16).replace('T', ' '),
        color: revoked ? '#6B7280' : '#07C160',
    }
}

interface ExchangesData {
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    user: { nickname: string } | null
    isWide: boolean
    isParent: boolean
    list: DisplayExchange[]
    loading: boolean
    showCreate: boolean
    showTypeSheet: boolean
    newType: string
    newTypeLabel: string
    pointsCost: number
}

Page<ExchangesData>({
    data: {
        children: [],
        currentChildId: null,
        list: [],
        loading: false,
        showCreate: false,
        showTypeSheet: false,
        user: null,
        isWide: false,
        isParent: false,
        newType: 'game',
        newTypeLabel: '娱乐时间',
        pointsCost: 10,
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
        this.loadList()
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<AppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
        this.loadList()
    },
    async loadList() {
        this.setData({ loading: true })
        try {
            const list = await callCloudFunction<Exchange[]>('exchanges', {
                action: 'list',
            })
            this.setData({ list: (list || []).map(decorate) })
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
            newType: 'game',
            newTypeLabel: '娱乐时间',
            pointsCost: 10,
        })
    },
    closeCreate() {
        this.setData({ showCreate: false })
    },
    openTypeSheet() {
        this.setData({ showTypeSheet: true })
    },
    closeTypeSheet() {
        this.setData({ showTypeSheet: false })
    },
    onPickType(e: WechatMiniprogram.CustomEvent) {
        const item = EXCHANGE_OPTIONS[e.detail.index]
        if (item) this.setData({ newType: item.value, newTypeLabel: item.label })
        this.setData({ showTypeSheet: false })
    },
    onCostChange(e: WechatMiniprogram.CustomEvent) {
        this.setData({ pointsCost: Number(e.detail.value) })
    },
    async onCreateConfirm() {
        try {
            await callCloudFunction('exchanges', {
                action: 'create',
                itemType: this.data.newType,
                pointsCost: this.data.pointsCost,
            })
            this.setData({ showCreate: false })
            wx.showToast({ title: '兑换成功', icon: 'success' })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '兑换失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    async onRevoke(e: WechatMiniprogram.TouchEvent) {
        const id = Number(e.currentTarget.dataset.id)
        const item = this.data.list.find((x) => x.id === id)
        if (!item || item.status === 'revoked') return
        const confirm = await new Promise<boolean>((resolve) => {
            wx.showModal({
                title: '撤销兑换',
                content: '撤销后将返还积分，确定？',
                success: (r) => resolve(r.confirm),
            })
        })
        if (!confirm) return
        try {
            await callCloudFunction('exchanges', { action: 'revoke', id })
            wx.showToast({ title: '已撤销', icon: 'success' })
            this.loadList()
        } catch (err) {
            const msg = err instanceof Error ? err.message : '撤销失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    onLogout() {
        wx.reLaunch({ url: '/pages/my/my' })
    },
})
