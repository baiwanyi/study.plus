import { getToken, getCurrentChildId } from '../../utils/auth'

interface DashData {
    user: { nickname: string } | null
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
    isWide: boolean
    currentPage: string
}

Page<DashData>({
    data: {
        user: null,
        children: [],
        currentChildId: null,
        isWide: false,
        currentPage: 'dashboard',
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<AppOption>()
        this.setData({
            user: app.globalData.user,
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
            isWide: app.globalData.platform.isWide,
        })
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<AppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
    },
    onLogout() {
        wx.switchTab({ url: '/pages/my/my' })
    },
    goTasks() {
        wx.switchTab({ url: '/pages/tasks/tasks' })
    },
    goPoints() {
        wx.switchTab({ url: '/pages/points/points' })
    },
})
