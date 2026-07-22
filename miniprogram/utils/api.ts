import { getToken, getCurrentChildId } from './auth'

export interface CallResult<T> {
    code: number
    data?: T
    error?: boolean
    message?: string
}

/**
 * 统一云函数调用封装：自动携带登录令牌与当前孩子 ID（家长视角隔离数据）。
 * 401 自动清理登录态并跳转登录页。
 */
export function callCloudFunction<T>(
    name: string,
    data: Record<string, unknown> = {},
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const token = getToken()
        const childId = getCurrentChildId()
        wx.cloud.callFunction({
            name,
            data: {
                ...data,
                token: token || undefined,
                childId: childId ?? undefined,
            },
            success: (res) => {
                const result = res.result as CallResult<T> | undefined
                if (!result) {
                    reject(new Error('云函数返回空响应'))
                    return
                }
                if (result.code === 401) {
                    wx.removeStorageSync('loginToken')
                    wx.reLaunch({ url: '/pages/login/login' })
                    reject(new Error('登录已过期，请重新登录'))
                    return
                }
                if (result.error) {
                    reject(new Error(result.message || '请求失败'))
                    return
                }
                resolve(result.data as T)
            },
            fail: (err) => {
                reject(new Error(err.errMsg || '云函数调用失败'))
            },
        })
    })
}
