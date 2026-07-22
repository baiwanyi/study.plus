import { callCloudFunction } from '../../utils/api'
import {
    getCurrentChildId,
    getCurrentRole,
    setCurrentChildId,
    getToken,
    logout,
    type ChildItem,
    type UserInfo,
} from '../../utils/auth'

const GRADES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级']

interface MyData {
    user: UserInfo | null
    children: ChildItem[]
    currentChildId: number | null
    grades: string[]
    addVisible: boolean
    newName: string
    newGrade: string
    loading: boolean
    isParent: boolean
    isWide: boolean
}

Page<MyData>({
    data: {
        user: null,
        children: [],
        currentChildId: null,
        grades: GRADES,
        addVisible: false,
        newName: '',
        newGrade: '一年级',
        loading: false,
        isParent: false,
        isWide: false,
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
            isParent: getCurrentRole() === 'parent',
            isWide: app.globalData.platform.isWide,
        })
    },
    goCategories() {
        wx.navigateTo({ url: '/pages/categories/categories' })
    },
    goOptions() {
        wx.navigateTo({ url: '/pages/options/options' })
    },
    onSelectChild(e: WechatMiniprogram.CustomEvent) {
        const id = Number(e.detail.childId)
        setCurrentChildId(id)
        getApp<AppOption>().globalData.currentChildId = id
        this.setData({ currentChildId: id })
        wx.showToast({ title: '已切换', icon: 'none' })
    },
    openAdd() {
        this.setData({ addVisible: true, newName: '', newGrade: '一年级' })
    },
    closeAdd() {
        this.setData({ addVisible: false })
    },
    onName(e: WechatMiniprogram.Input) {
        this.setData({ newName: e.detail.value })
    },
    onGrade(e: WechatMiniprogram.TouchEvent) {
        this.setData({ newGrade: e.currentTarget.dataset.g })
    },
    async confirmAdd() {
        const name = this.data.newName.trim()
        if (!name) {
            wx.showToast({ title: '请输入孩子昵称', icon: 'none' })
            return
        }
        this.setData({ loading: true })
        try {
            const res = await callCloudFunction<{ child: ChildItem }>('family', {
                action: 'add',
                nickname: name,
                grade: this.data.newGrade,
            })
            const app = getApp<AppOption>()
            const children = [...this.data.children, res.child]
            app.globalData.children = children
            this.setData({ children, addVisible: false })
            wx.showToast({ title: '添加成功', icon: 'success' })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '添加失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
    async onRemove(e: WechatMiniprogram.TouchEvent) {
        const id = Number(e.currentTarget.dataset.id)
        const modal = await wx.showModal({
            title: '移除孩子',
            content: '确认移除该孩子？相关数据将被停用。',
        })
        if (!modal.confirm) return
        try {
            await callCloudFunction('family', { action: 'remove', childId: id })
            const children = this.data.children.filter((c) => c.childId !== id)
            getApp<AppOption>().globalData.children = children
            if (getCurrentChildId() === id) {
                setCurrentChildId(children[0]?.childId ?? null)
            }
            this.setData({ children, currentChildId: getCurrentChildId() })
            wx.showToast({ title: '已移除', icon: 'none' })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '操作失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    onLogout() {
        wx.showModal({
            title: '退出登录',
            content: '确认退出当前账号？',
            success: (r) => {
                if (r.confirm) {
                    logout()
                    wx.reLaunch({ url: '/pages/login/login' })
                }
            },
        })
    },
    async onExport() {
        try {
            const data = await callCloudFunction<Record<string, unknown>>('privacy', {
                action: 'export',
            })
            const keys = Object.keys(data)
            wx.showModal({
                title: '数据导出',
                content: `已为你汇总 ${keys.length} 类数据，可联系客服获取完整文件。`,
                showCancel: false,
            })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '导出失败'
            wx.showToast({ title: msg, icon: 'none' })
        }
    },
    onPrivacy() {
        wx.showModal({
            title: '隐私协议',
            content: '我们依据《个人信息保护法》最小化收集数据，你有权导出或删除自己的全部数据。',
            showCancel: false,
        })
    },
    onDeleteAccount() {
        wx.showModal({
            title: '删除账户',
            content: '将永久删除你及关联孩子的全部数据，且不可恢复。确认后再次点击确定。',
            success: async (r) => {
                if (!r.confirm) return
                try {
                    await callCloudFunction('privacy', { action: 'delete', confirm: true })
                    wx.showToast({ title: '已删除', icon: 'success' })
                    logout()
                    wx.reLaunch({ url: '/pages/login/login' })
                } catch (err) {
                    const msg = err instanceof Error ? err.message : '删除失败'
                    wx.showToast({ title: msg, icon: 'none' })
                }
            },
        })
    },
})
