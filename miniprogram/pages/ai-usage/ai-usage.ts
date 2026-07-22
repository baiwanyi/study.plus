import { callCloudFunction } from '../../utils/api'
import { getToken } from '../../utils/auth'

interface UsageLog {
    id: number
    project: string
    task_title: string | null
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    created_at: string
}

interface UsageSummary {
    project: string
    count: number
    totalTokens: number
}

Page({
    data: {
        loading: true,
        summary: [] as UsageSummary[],
        list: [] as UsageLog[],
        totalTokens: 0,
        isWide: false,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<AppOption>()
        this.setData({
            isWide: app.globalData.platform.isWide,
            user: app.globalData.user,
            children: app.globalData.children,
            currentChildId: app.globalData.currentChildId,
        })
        this.loadAll()
    },
    onLogout() {
        wx.reLaunch({ url: '/pages/my/my' })
    },
    async loadAll() {
        this.setData({ loading: true })
        try {
            const [summary, list] = await Promise.all([
                callCloudFunction<UsageSummary[]>('ai-usage', { action: 'summary' }),
                callCloudFunction<UsageLog[]>('ai-usage', { action: 'list', limit: 50 }),
            ])
            const total = (summary || []).reduce((s, x) => s + (x.totalTokens || 0), 0)
            this.setData({
                summary: summary || [],
                list: list || [],
                totalTokens: total,
                loading: false,
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '加载失败'
            wx.showToast({ title: msg, icon: 'none' })
            this.setData({ loading: false })
        }
    },
})
