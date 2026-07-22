interface NavItem {
    key: string
    label: string
    icon: string
    url: string
    tab: boolean
}

const NAV_ITEMS: NavItem[] = [
    { key: 'dashboard', label: '首页', icon: '🏠', url: '/pages/dashboard/dashboard', tab: true },
    { key: 'tasks', label: '作业管理', icon: '📝', url: '/pages/tasks/tasks', tab: true },
    { key: 'weekly', label: '周报', icon: '📋', url: '/pages/weekly/weekly', tab: false },
    { key: 'studynotes', label: '学习心得', icon: '🔖', url: '/pages/studynotes/studynotes', tab: false },
    { key: 'points', label: '积分流水', icon: '⭐', url: '/pages/points/points', tab: true },
    { key: 'exchanges', label: '积分兑换', icon: '🔄', url: '/pages/exchanges/exchanges', tab: false },
    { key: 'borrow', label: '积分预支', icon: '💳', url: '/pages/borrow/borrow', tab: false },
    { key: 'ai-usage', label: 'AI 用量', icon: '💬', url: '/pages/ai-usage/ai-usage', tab: false },
    { key: 'share', label: '分享统计', icon: '📤', url: '/pages/share/share', tab: false },
]

Component({
    properties: {
        user: {
            type: Object as unknown as WechatMiniprogram.IAnyObject,
            value: null,
        },
        children: {
            type: Array,
            value: [],
        },
        currentChildId: {
            type: Number,
            value: null,
        },
        currentPage: {
            type: String,
            value: '',
        },
    },
    data: {
        navItems: [] as NavItem[],
    },
    lifetimes: {
        attached() {
            this.setData({ navItems: NAV_ITEMS })
        },
    },
    methods: {
        onNav(e: WechatMiniprogram.TouchEvent) {
            const dataset = e.currentTarget.dataset as { url: string; tab: string }
            const { url, tab } = dataset
            if (tab === 'true') {
                wx.switchTab({ url })
            } else {
                wx.navigateTo({ url })
            }
        },
        onChildChange(e: WechatMiniprogram.CustomEvent) {
            this.triggerEvent('childchange', e.detail)
        },
        onLogout() {
            this.triggerEvent('logout')
        },
    },
})
