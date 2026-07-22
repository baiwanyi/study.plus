import { getToken, getCurrentChildId } from '../../utils/auth'

interface IDashData {
    user: { nickname: string } | null
    children: Array<{ childId: number; nickname: string; grade: string }>
    currentChildId: number | null
}

Page<IDashData>({
    data: {
        user: null,
        children: [],
        currentChildId: null,
    },
    onShow() {
        if (!getToken()) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
        }
        const app = getApp<IAppOption>()
        this.setData({
            user: app.globalData.user,
            children: app.globalData.children,
            currentChildId: getCurrentChildId(),
        })
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        const app = getApp<IAppOption>()
        app.globalData.currentChildId = id
        wx.setStorageSync('currentChildId', id)
        this.setData({ currentChildId: id })
    },
    goTasks() {
        wx.switchTab({ url: '/pages/tasks/tasks' })
    },
    goPoints() {
        wx.switchTab({ url: '/pages/points/points' })
    },
})
