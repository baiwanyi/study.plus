import { getToken } from './utils/auth'
import { prefetchOnStart } from './utils/prefetch'
import { initPlatform, updatePlatformFromResize } from './utils/platform'
import type { PlatformInfo } from './utils/platform'

interface UserInfo {
    id: number
    nickname: string
    avatar: string
    role: 'parent' | 'child'
}

interface ChildItem {
    childId: number
    nickname: string
    grade: string
    sortOrder: number
}

interface AppOption {
    globalData: {
        token: string
        currentChildId: number | null
        user: UserInfo | null
        children: ChildItem[]
        platform: PlatformInfo
    }
    onLaunch: () => void
    onWindowResize: (size: { windowWidth: number; windowHeight: number }) => void
}

App<AppOption>({
    globalData: {
        token: '',
        currentChildId: null,
        user: null,
        children: [],
        platform: { isPC: false, windowWidth: 375, windowHeight: 667, isWide: false },
    },
    onLaunch() {
        if (!wx.cloud) {
            console.error('请使用 2.2.3 或以上基础库以使用云能力')
        } else {
            wx.cloud.init({
                // env 留空表示使用默认环境；正式发布请在 miniprogram/utils/config.ts 中填入 ENV_ID
                env: '',
                traceUser: true,
            })
        }
        this.globalData.token = getToken()

        // 初始化平台信息
        this.globalData.platform = initPlatform()

        // 【预缓存】已登录时静默预取关键数据
        if (this.globalData.token) {
            // 延迟执行，不阻塞应用启动
            setTimeout(() => prefetchOnStart(), 0)
        }
    },
    // 【PC 适配】窗口大小变化时更新平台信息
    onWindowResize(res) {
        const update = updatePlatformFromResize(res.size)
        Object.assign(this.globalData.platform, update)
    },
})
