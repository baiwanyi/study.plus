import { login as doLogin, setCurrentChildId } from '../../utils/auth'

interface ILoginData {
    privacyAgreed: boolean
    privacyVisible: boolean
    loading: boolean
}

Page<ILoginData>({
    data: {
        privacyAgreed: false,
        privacyVisible: false,
        loading: false,
    },
    onAgreeChange(e: WechatMiniprogram.CheckboxChange) {
        this.setData({ privacyAgreed: e.detail.checked })
    },
    openPrivacy() {
        this.setData({ privacyVisible: true })
    },
    closePrivacy() {
        this.setData({ privacyVisible: false })
    },
    async onLogin() {
        if (!this.data.privacyAgreed) {
            wx.showToast({ title: '请先同意隐私协议', icon: 'none' })
            return
        }
        if (this.data.loading) return
        this.setData({ loading: true })
        try {
            let nickname = '微信用户'
            let avatar = ''
            try {
                const prof = await new Promise<WechatMiniprogram.GetUserProfileSuccessCallbackResult>(
                    (resolve, reject) => {
                        wx.getUserProfile({
                            desc: '用于完善学习档案',
                            success: resolve,
                            fail: reject,
                        })
                    },
                )
                nickname = prof.userInfo.nickName || nickname
                avatar = prof.userInfo.avatarUrl || ''
            } catch {
                // 用户拒绝或基础库不支持时，使用默认信息
            }
            const res = await doLogin(nickname, avatar, true)
            const app = getApp<IAppOption>()
            app.globalData.user = res.user
            app.globalData.children = res.children
            if (res.children.length > 0) {
                setCurrentChildId(res.children[0].childId)
            }
            wx.reLaunch({ url: '/pages/dashboard/dashboard' })
        } catch (err) {
            const msg = err instanceof Error ? err.message : '登录失败'
            wx.showToast({ title: msg, icon: 'none' })
        } finally {
            this.setData({ loading: false })
        }
    },
})
