import { getToken } from './utils/auth'

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

interface IAppOption {
    globalData: {
        token: string
        currentChildId: number | null
        user: UserInfo | null
        children: ChildItem[]
    }
    onLaunch: () => void
}

App<IAppOption>({
    globalData: {
        token: '',
        currentChildId: null,
        user: null,
        children: [],
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
    },
})
