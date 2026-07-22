import { callCloudFunction } from '../../utils/api'
import { getToken, getCurrentChildId } from '../../utils/auth'

interface ShareStats {
    month: string
    totalEarn: number
    totalDeduct: number
    totalExchanges: number
    balance: number
    availableBalance: number
    exchangeInfo: { totalDuration: number; longestDay: string; longestDayDuration: number }
    submissionEarnTotal: number
    examEarnTotal: number
}

Page({
    data: {
        loading: true,
        months: [] as string[],
        monthIndex: 0,
        month: '',
        stats: null as ShareStats | null,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        this.initMonths()
    },
    async initMonths() {
        const current = new Date().toISOString().slice(0, 7)
        let months: string[] = []
        try {
            months = await callCloudFunction<string[]>('points', { action: 'available-months' })
        } catch {
            months = []
        }
        if (!months.includes(current)) months.unshift(current)
        this.setData({
            months,
            monthIndex: 0,
            month: months[0] || current,
        })
        this.loadStats()
    },
    async loadStats() {
        this.setData({ loading: true })
        try {
            const stats = await callCloudFunction<ShareStats>('share-stats', {
                month: this.data.month,
                childId: getCurrentChildId(),
            })
            this.setData({ stats, loading: false }, () => {
                const card = this.selectComponent('#shareCard')
                if (card) card.draw()
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ loading: false })
        }
    },
    onMonthChange(e: WechatMiniprogram.CustomEvent) {
        const index = e.detail.value[0]
        this.setData({ monthIndex: index, month: this.data.months[index] })
        this.loadStats()
    },
})
